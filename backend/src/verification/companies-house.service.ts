import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { PromotionEngine } from './promotion-engine.service';

const COMPANIES_HOUSE_BASE = 'https://api.company-information.service.gov.uk';

type CompaniesHouseCompany = {
  company_name: string;
  company_status: string;
  company_number: string;
};

/**
 * Companies House public API client + employer self-verification flow.
 *
 * Free public API: developer.company-information.service.gov.uk. Auth is
 * HTTP Basic with the API key as the username and an empty password. JSON
 * responses. Rate limit: 600 requests per 5 min globally — well above the
 * per-IP cap we set in the controller.
 */
@Injectable()
export class CompaniesHouseService {
  private readonly logger = new Logger(CompaniesHouseService.name);
  private readonly apiKey: string;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly promotionEngine: PromotionEngine,
  ) {
    this.apiKey = this.config.get<string>('COMPANIES_HOUSE_API_KEY') || '';
  }

  isConfigured(): boolean {
    return this.apiKey.length > 0;
  }

  /**
   * Verify the employer's self-asserted company against Companies House.
   * On match: write `COMPANY_HOUSE_VERIFIED` milestone and run the
   * promotion engine. Returns the registry response for SPA display.
   */
  async verifyEmployer(employerProfileId: bigint, ip?: string) {
    if (!this.isConfigured()) {
      throw new ServiceUnavailableException({
        code: 'COMPANIES_HOUSE_NOT_CONFIGURED',
        message:
          'Companies House verification is temporarily unavailable. Please try again later.',
      });
    }

    const employer = await this.prisma.employerProfile.findUnique({
      where: { id: employerProfileId },
      include: {
        client_profile: { select: { display_name: true } },
      },
    });
    if (!employer) {
      throw new NotFoundException({
        code: 'EMPLOYER_NOT_FOUND',
        message: 'Employer profile not found.',
      });
    }
    if (!employer.company_number || !employer.company_name) {
      throw new BadRequestException({
        code: 'COMPANY_DETAILS_MISSING',
        message:
          'Set your company name and Companies House number on your profile before verifying.',
      });
    }

    const company = await this.fetchCompany(employer.company_number);

    if (company === null) {
      throw new NotFoundException({
        code: 'COMPANIES_HOUSE_NOT_FOUND',
        message: `No company exists at Companies House with number ${employer.company_number}.`,
      });
    }

    if (company.company_status !== 'active') {
      await this.audit.log(
        employerProfileId,
        'verification.companies_house.checked',
        'employer_profile',
        employerProfileId,
        { result: 'INACTIVE', registry_status: company.company_status },
        ip,
      );
      throw new ForbiddenException({
        code: 'COMPANIES_HOUSE_MISMATCH',
        message: `Companies House records this company as ${company.company_status}, not active.`,
        registry_response: {
          name: company.company_name,
          status: company.company_status,
        },
      });
    }

    if (!normaliseCompanyName(company.company_name).includes(
      normaliseCompanyName(employer.company_name),
    ) && !normaliseCompanyName(employer.company_name).includes(
      normaliseCompanyName(company.company_name),
    )) {
      await this.audit.log(
        employerProfileId,
        'verification.companies_house.checked',
        'employer_profile',
        employerProfileId,
        {
          result: 'NAME_MISMATCH',
          registry_name: company.company_name,
          submitted_name: employer.company_name,
        },
        ip,
      );
      throw new BadRequestException({
        code: 'COMPANIES_HOUSE_MISMATCH',
        message: `Company name does not match Companies House records.`,
        registry_response: {
          name: company.company_name,
          status: company.company_status,
        },
      });
    }

    const milestone = await this.prisma.verificationMilestone.create({
      data: {
        client_profile_id: employerProfileId,
        milestone_type: 'COMPANY_HOUSE_VERIFIED',
        evidence_ref: employer.company_number,
        notes: JSON.stringify(company),
      },
    });
    await this.audit.log(
      employerProfileId,
      'verification.companies_house.checked',
      'employer_profile',
      employerProfileId,
      { result: 'MATCHED', registry_name: company.company_name },
      ip,
    );

    await this.promotionEngine.runPromotion(employerProfileId, {
      milestoneIds: [milestone.id],
      staffMemberId: null,
      ip,
    });

    return {
      matched: true,
      milestone_id: milestone.id.toString(),
      registry_company_name: company.company_name,
    };
  }

  /**
   * Raw API call to Companies House. Returns null on 404 (company not found).
   * Throws `ServiceUnavailableException` on any 5xx — staff fallback path
   * is the manual upload of a Company Letterhead.
   */
  private async fetchCompany(
    companyNumber: string,
  ): Promise<CompaniesHouseCompany | null> {
    const url = `${COMPANIES_HOUSE_BASE}/company/${encodeURIComponent(companyNumber)}`;
    const auth = Buffer.from(`${this.apiKey}:`).toString('base64');

    let res: Response;
    try {
      res = await fetch(url, {
        headers: {
          Authorization: `Basic ${auth}`,
          Accept: 'application/json',
        },
      });
    } catch (err) {
      this.logger.error(
        `Companies House network failure (company=${companyNumber})`,
        err as Error,
      );
      throw new ServiceUnavailableException({
        code: 'COMPANIES_HOUSE_UPSTREAM',
        message:
          'Companies House is temporarily unreachable. Please try again in a moment.',
      });
    }

    if (res.status === 404) return null;
    if (res.status === 401 || res.status === 403) {
      this.logger.error(
        `Companies House auth failure (status=${res.status}) — check COMPANIES_HOUSE_API_KEY`,
      );
      throw new ServiceUnavailableException({
        code: 'COMPANIES_HOUSE_NOT_CONFIGURED',
        message: 'Companies House verification is temporarily unavailable.',
      });
    }
    if (res.status >= 500) {
      throw new ServiceUnavailableException({
        code: 'COMPANIES_HOUSE_UPSTREAM',
        message:
          'Companies House is temporarily unreachable. Please try again in a moment.',
      });
    }
    if (!res.ok) {
      this.logger.warn(
        `Companies House unexpected status ${res.status} for company=${companyNumber}`,
      );
      throw new BadRequestException({
        code: 'COMPANIES_HOUSE_BAD_REQUEST',
        message: 'Companies House rejected the lookup. Check the company number.',
      });
    }

    const body = (await res.json()) as Partial<CompaniesHouseCompany>;
    if (!body.company_name || !body.company_status) {
      throw new ServiceUnavailableException({
        code: 'COMPANIES_HOUSE_UPSTREAM',
        message: 'Companies House returned an unexpected response shape.',
      });
    }
    return body as CompaniesHouseCompany;
  }
}

function normaliseCompanyName(input: string): string {
  return input
    .toUpperCase()
    .replace(/\bLIMITED\b/g, 'LTD')
    .replace(/\bPUBLIC LIMITED COMPANY\b/g, 'PLC')
    .replace(/[.,()&]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
