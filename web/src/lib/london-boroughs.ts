/**
 * London-borough preset list (PROF-015). Greater-London soft launch only —
 * `city` and `postcode_area` editor inputs constrain to this set in MVP.
 *
 * Postcode outward-code groupings are not exhaustive (Greater London uses
 * E, EC, N, NW, SE, SW, W, WC plus partial coverage from BR, CR, DA, EN,
 * HA, IG, KT, RM, SM, TW, UB, WD); the entries below cover the most-used
 * outward codes for each borough. Users can still type a free-text
 * postcode area; the picker is suggestion-only.
 */

export type LondonBorough = {
  name: string;
  postcodeAreas: string[];
};

export const LONDON_BOROUGHS: LondonBorough[] = [
  { name: 'Barking and Dagenham', postcodeAreas: ['IG11', 'RM8', 'RM9', 'RM10'] },
  { name: 'Barnet', postcodeAreas: ['EN4', 'EN5', 'N2', 'N3', 'N11', 'N12', 'N20', 'NW4', 'NW7', 'NW9', 'NW11'] },
  { name: 'Bexley', postcodeAreas: ['DA5', 'DA6', 'DA7', 'DA8', 'DA14', 'DA15', 'DA16', 'DA17', 'DA18'] },
  { name: 'Brent', postcodeAreas: ['HA0', 'HA9', 'NW2', 'NW6', 'NW9', 'NW10', 'W3'] },
  { name: 'Bromley', postcodeAreas: ['BR1', 'BR2', 'BR3', 'BR4', 'BR5', 'BR6', 'BR7', 'BR8', 'SE9', 'SE12', 'SE20'] },
  { name: 'Camden', postcodeAreas: ['NW1', 'NW3', 'NW5', 'WC1', 'WC2', 'N6'] },
  { name: 'City of London', postcodeAreas: ['EC1', 'EC2', 'EC3', 'EC4'] },
  { name: 'Croydon', postcodeAreas: ['CR0', 'CR2', 'CR3', 'CR5', 'CR7', 'CR8', 'CR9', 'SE25'] },
  { name: 'Ealing', postcodeAreas: ['UB1', 'UB2', 'UB5', 'UB6', 'W3', 'W5', 'W7', 'W13'] },
  { name: 'Enfield', postcodeAreas: ['EN1', 'EN2', 'EN3', 'N9', 'N13', 'N14', 'N18', 'N21'] },
  { name: 'Greenwich', postcodeAreas: ['SE3', 'SE7', 'SE9', 'SE10', 'SE18', 'SE28'] },
  { name: 'Hackney', postcodeAreas: ['E2', 'E5', 'E8', 'E9', 'N1', 'N16'] },
  { name: 'Hammersmith and Fulham', postcodeAreas: ['SW6', 'W6', 'W12', 'W14'] },
  { name: 'Haringey', postcodeAreas: ['N4', 'N6', 'N8', 'N10', 'N15', 'N17', 'N22'] },
  { name: 'Harrow', postcodeAreas: ['HA1', 'HA2', 'HA3', 'HA5', 'HA7', 'HA8'] },
  { name: 'Havering', postcodeAreas: ['RM1', 'RM2', 'RM3', 'RM4', 'RM5', 'RM7', 'RM11', 'RM12', 'RM13', 'RM14'] },
  { name: 'Hillingdon', postcodeAreas: ['UB3', 'UB4', 'UB7', 'UB8', 'UB9', 'UB10', 'UB11'] },
  { name: 'Hounslow', postcodeAreas: ['TW3', 'TW4', 'TW5', 'TW7', 'TW8', 'TW13', 'TW14', 'W4'] },
  { name: 'Islington', postcodeAreas: ['EC1', 'N1', 'N4', 'N5', 'N7', 'N19'] },
  { name: 'Kensington and Chelsea', postcodeAreas: ['SW3', 'SW5', 'SW7', 'SW10', 'W8', 'W10', 'W11', 'W14'] },
  { name: 'Kingston upon Thames', postcodeAreas: ['KT1', 'KT2', 'KT3', 'KT5', 'KT6', 'KT9'] },
  { name: 'Lambeth', postcodeAreas: ['SE11', 'SE24', 'SE27', 'SW2', 'SW4', 'SW8', 'SW9', 'SW16'] },
  { name: 'Lewisham', postcodeAreas: ['SE4', 'SE6', 'SE8', 'SE12', 'SE13', 'SE14', 'SE23', 'SE26'] },
  { name: 'Merton', postcodeAreas: ['SM4', 'SW17', 'SW19', 'SW20', 'CR4'] },
  { name: 'Newham', postcodeAreas: ['E6', 'E7', 'E12', 'E13', 'E15', 'E16'] },
  { name: 'Redbridge', postcodeAreas: ['IG1', 'IG2', 'IG3', 'IG4', 'IG5', 'IG6', 'IG7', 'IG8', 'E11', 'E18'] },
  { name: 'Richmond upon Thames', postcodeAreas: ['KT2', 'SW13', 'SW14', 'TW1', 'TW2', 'TW9', 'TW10', 'TW11', 'TW12'] },
  { name: 'Southwark', postcodeAreas: ['SE1', 'SE5', 'SE15', 'SE16', 'SE17', 'SE21', 'SE22', 'SE24'] },
  { name: 'Sutton', postcodeAreas: ['SM1', 'SM2', 'SM3', 'SM5', 'SM6', 'SM7'] },
  { name: 'Tower Hamlets', postcodeAreas: ['E1', 'E2', 'E3', 'E14'] },
  { name: 'Waltham Forest', postcodeAreas: ['E4', 'E10', 'E11', 'E17'] },
  { name: 'Wandsworth', postcodeAreas: ['SW8', 'SW11', 'SW12', 'SW15', 'SW17', 'SW18', 'SW19'] },
  { name: 'Westminster', postcodeAreas: ['NW1', 'NW8', 'SW1', 'W1', 'W2', 'W9', 'WC1', 'WC2'] },
];

export const LONDON_BOROUGH_NAMES: string[] = LONDON_BOROUGHS.map(
  (b) => b.name,
);

export function postcodeAreasFor(boroughName: string | null | undefined): string[] {
  if (!boroughName) return [];
  const match = LONDON_BOROUGHS.find((b) => b.name === boroughName);
  return match?.postcodeAreas ?? [];
}

export const POSTCODE_OUTWARD_REGEX = /^[A-Z]{1,2}\d{1,2}[A-Z]?$/;
