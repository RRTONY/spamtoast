import { describe, expect, it } from "vitest";
import { cn } from "@/lib/utils";

describe("cn", () => {
  it("joins class names and drops falsy ones", () => {
    expect(cn("a", false, null, undefined, "b")).toBe("a b");
  });

  it("lets a later Tailwind class win over a conflicting earlier one", () => {
    expect(cn("px-2 text-sm", "px-4")).toBe("text-sm px-4");
  });

  it("accepts conditional objects", () => {
    expect(cn({ hidden: false, block: true })).toBe("block");
  });
});
