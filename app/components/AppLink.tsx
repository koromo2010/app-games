"use client";

import NextLink from "next/link";
import type { ComponentProps } from "react";
import { useAppLocale } from "@/app/components/AppLocaleProvider";
import { useRouteTransition } from "@/app/components/RouteTransitionProvider";
import { localizedAppHref } from "@/lib/app-locale-routing";

type Props = ComponentProps<typeof NextLink>;

export function AppLink({ href, onNavigate, ...props }: Props) {
  const { locale } = useAppLocale();
  const { beginRouteTransition } = useRouteTransition();
  const localizedHref = typeof href === "string" ? localizedAppHref(href, locale) : href;
  return (
    <NextLink
      {...props}
      href={localizedHref}
      onNavigate={(event) => {
        let prevented = false;
        onNavigate?.({
          preventDefault: () => {
            prevented = true;
            event.preventDefault();
          },
        });
        if (!prevented) beginRouteTransition();
      }}
    />
  );
}
