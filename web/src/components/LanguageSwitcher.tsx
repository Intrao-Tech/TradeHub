import { Check, Globe } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@/components/ui/dropdown-menu";
import { SUPPORTED_LNGS, type SupportedLng } from "@/i18n";

/**
 * Language is an authenticated-only setting: the ONLY switcher in the app is
 * the submenu inside the AppShell account dropdown. Auth pages and logged-out
 * marketing pages have no switcher (logged-out marketplace is pinned to EN in
 * App.tsx). Names come from the `common` namespace (`language.<code>`) and are
 * written in each language's own script, so the list reads the same regardless
 * of the active language. Adding a language = adding it to SUPPORTED_LNGS +
 * a `public/locales/<code>/` folder — this list updates itself.
 */
function useLanguageOptions() {
  const { t, i18n } = useTranslation("common");
  const active = (i18n.resolvedLanguage ?? "en") as SupportedLng;
  const options = SUPPORTED_LNGS.map((code) => ({
    code,
    label: t(`language.${code}`),
    isActive: active === code,
  }));
  const change = (lng: SupportedLng) => {
    // i18next persists the choice to localStorage (detection cache) itself.
    void i18n.changeLanguage(lng);
  };
  return { t, active, options, change };
}

/**
 * Language picker for use INSIDE the AppShell account dropdown — mirrors
 * <ThemeSubmenu/> so both settings read the same way.
 */
export function LanguageSubmenu() {
  const { t, active, options, change } = useLanguageOptions();
  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger className="gap-2">
        <Globe className="h-4 w-4" />
        <span>
          {t("language.label")}: {t(`language.${active}`)}
        </span>
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="w-48">
        {options.map(({ code, label, isActive }) => (
          <DropdownMenuItem
            key={code}
            onSelect={(e) => {
              e.preventDefault();
              change(code);
            }}
            className="gap-2"
          >
            <span className="flex-1 text-sm text-fg">{label}</span>
            {isActive ? (
              <Check className="h-4 w-4 shrink-0 text-primary" />
            ) : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}
