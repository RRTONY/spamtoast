import { render, type RenderOptions } from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";

// Async Server Components can't go straight into render(): call them, await
// the JSX they return, then render that.
//
//   await renderServer(Page({ params: Promise.resolve({ slug: "five-cups" }) }));
//   expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Five Cups");
export async function renderServer(element: Promise<ReactNode> | ReactNode, options?: RenderOptions) {
  const resolved = await element;
  return render(resolved as ReactElement, options);
}

// Page/layout props in Next 16 are Promises.
export function pageProps<P extends Record<string, string | string[]>>(
  params: P = {} as P,
  searchParams: Record<string, string | string[] | undefined> = {},
) {
  return { params: Promise.resolve(params), searchParams: Promise.resolve(searchParams) };
}
