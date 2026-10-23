import * as React from "react";
import { vi } from "vitest";

// Fakes for the Next.js modules (wired in setup.ts). Tests can read and
// steer them:
//
//   navigation.pathname = "/blog";
//   navigation.searchParams = new URLSearchParams("q=coffee");
//   expect(navigation.router.push).toHaveBeenCalledWith("/find-my");
//   cookieJar.set("visited", "1");
//   await expect(Page()).rejects.toThrow("NEXT_NOT_FOUND");

export class NextNotFoundError extends Error {
  constructor() {
    super("NEXT_NOT_FOUND");
  }
}
export class NextRedirectError extends Error {
  constructor(public url: string, public permanent = false) {
    super(`NEXT_REDIRECT:${url}`);
  }
}

function makeRouter() {
  return {
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
  };
}

export const navigation = {
  pathname: "/",
  searchParams: new URLSearchParams(),
  params: {} as Record<string, string | string[]>,
  router: makeRouter(),
};

export function resetNavigation() {
  navigation.pathname = "/";
  navigation.searchParams = new URLSearchParams();
  navigation.params = {};
  navigation.router = makeRouter();
  cookieJar.clear();
  headerJar.clear();
}

export const navigationModule = {
  useRouter: () => navigation.router,
  usePathname: () => navigation.pathname,
  useSearchParams: () => navigation.searchParams,
  useParams: () => navigation.params,
  useSelectedLayoutSegment: () => null,
  useSelectedLayoutSegments: () => [],
  notFound: vi.fn(() => {
    throw new NextNotFoundError();
  }),
  redirect: vi.fn((url: string) => {
    throw new NextRedirectError(url);
  }),
  permanentRedirect: vi.fn((url: string) => {
    throw new NextRedirectError(url, true);
  }),
  RedirectType: { push: "push", replace: "replace" },
  unstable_rethrow: vi.fn(),
};

// ---- next/headers ---------------------------------------------------------

export const cookieJar = new Map<string, string>();
export const headerJar = new Map<string, string>();

const cookieStore = {
  get: (name: string) => (cookieJar.has(name) ? { name, value: cookieJar.get(name)! } : undefined),
  getAll: () => [...cookieJar].map(([name, value]) => ({ name, value })),
  has: (name: string) => cookieJar.has(name),
  set: vi.fn((name: string | { name: string; value: string }, value?: string) => {
    if (typeof name === "object") cookieJar.set(name.name, name.value);
    else cookieJar.set(name, value ?? "");
  }),
  delete: vi.fn((name: string) => cookieJar.delete(name)),
};

export const headersModule = {
  cookies: vi.fn(async () => cookieStore),
  headers: vi.fn(async () => new Headers([...headerJar])),
  draftMode: vi.fn(async () => ({ isEnabled: false, enable: vi.fn(), disable: vi.fn() })),
};

// ---- next/cache -----------------------------------------------------------

export const cacheModule = {
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
  updateTag: vi.fn(),
  refresh: vi.fn(),
  unstable_cache: <T extends (...args: never[]) => unknown>(fn: T) => fn,
  unstable_noStore: vi.fn(),
  cacheLife: vi.fn(),
  cacheTag: vi.fn(),
};

// ---- next/image, next/link, next/script -----------------------------------

type ImgProps = React.ImgHTMLAttributes<HTMLImageElement> & {
  src: string | { src: string };
  fill?: boolean;
  priority?: boolean;
  quality?: number;
  placeholder?: string;
  blurDataURL?: string;
  unoptimized?: boolean;
  loader?: unknown;
  preload?: boolean;
};

function FakeImage({ src, alt, fill, priority, quality, placeholder, blurDataURL, unoptimized, loader, preload, ...rest }: ImgProps) {
  void fill; void priority; void quality; void placeholder; void blurDataURL; void unoptimized; void loader; void preload;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={typeof src === "string" ? src : src.src} alt={alt} {...rest} />;
}
export const imageModule = { __esModule: true, default: FakeImage, getImageProps: (p: ImgProps) => ({ props: p }) };

type LinkProps = Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & {
  href: string | { pathname?: string; query?: Record<string, string>; hash?: string };
  prefetch?: boolean | null;
  replace?: boolean;
  scroll?: boolean;
  shallow?: boolean;
  passHref?: boolean;
  legacyBehavior?: boolean;
  onNavigate?: unknown;
};

const FakeLink = React.forwardRef<HTMLAnchorElement, LinkProps>(function FakeLink(
  { href, prefetch, replace, scroll, shallow, passHref, legacyBehavior, onNavigate, children, ...rest },
  ref,
) {
  void prefetch; void replace; void scroll; void shallow; void passHref; void legacyBehavior; void onNavigate;
  const url =
    typeof href === "string"
      ? href
      : `${href.pathname ?? ""}${href.query ? `?${new URLSearchParams(href.query)}` : ""}${href.hash ? `#${href.hash}` : ""}`;
  return (
    <a ref={ref} href={url} {...rest}>
      {children}
    </a>
  );
});
export const linkModule = { __esModule: true, default: FakeLink, useLinkStatus: () => ({ pending: false }) };

function FakeScript({ children, id }: { children?: React.ReactNode; id?: string; src?: string; strategy?: string }) {
  return <script data-testid={id ?? "next-script"}>{typeof children === "string" ? children : null}</script>;
}
export const scriptModule = { __esModule: true, default: FakeScript };

// ---- next/dynamic ---------------------------------------------------------
// Renders the real component once its import resolves (use findBy* queries).
export const dynamicModule = {
  __esModule: true,
  default: (loader: () => Promise<React.ComponentType<Record<string, unknown>> | { default: React.ComponentType<Record<string, unknown>> }>) => {
    const Lazy = React.lazy(async () => {
      const mod = await loader();
      return { default: "default" in mod ? mod.default : mod };
    });
    return function DynamicComponent(props: Record<string, unknown>) {
      return (
        <React.Suspense fallback={null}>
          <Lazy {...props} />
        </React.Suspense>
      );
    };
  },
};

// ---- fonts, themes --------------------------------------------------------

const font = () => ({ className: "font-test", variable: "--font-test", style: { fontFamily: "test" } });
// Every Google font the site imports, named explicitly: Vitest checks a mock's
// exports by name. Add a face here when the site starts using a new one.
const GOOGLE_FONTS = [
  "Cormorant_Garamond", "DM_Mono", "Fraunces", "IM_Fell_English",
  "Libre_Baskerville", "Playfair_Display", "Source_Sans_3", "Space_Grotesk",
] as const;
export const fontModule = Object.fromEntries(GOOGLE_FONTS.map((name) => [name, font]));
export const localFontModule = { __esModule: true, default: font };

export const theme = { theme: "light", resolvedTheme: "light", setTheme: vi.fn() };
export const themesModule = {
  useTheme: () => ({ ...theme, themes: ["light", "dark"], systemTheme: "light" }),
  ThemeProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
};
