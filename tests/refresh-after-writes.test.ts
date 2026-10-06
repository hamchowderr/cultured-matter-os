import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createWriteRefresher } from "@/lib/refresh-after-writes";

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("refresh after the assistant writes", () => {
  it("refreshes once after a write action ends", () => {
    const refresh = vi.fn();
    const r = createWriteRefresher(["createTask", "setGrantStatus"], refresh);
    r.onToolEnd({ toolName: "createTask", isError: false });
    expect(refresh).not.toHaveBeenCalled();
    vi.advanceTimersByTime(400);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("refreshes once for several writes that arrive together", () => {
    const refresh = vi.fn();
    const r = createWriteRefresher(["createTask", "setGrantStatus"], refresh);
    r.onToolEnd({ toolName: "createTask", isError: false });
    vi.advanceTimersByTime(200);
    r.onToolEnd({ toolName: "setGrantStatus", isError: false });
    vi.advanceTimersByTime(200);
    r.onToolEnd({ toolName: "createTask", isError: false });
    vi.advanceTimersByTime(400);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("ignores reads, failed writes and the assistant's own tools", () => {
    const refresh = vi.fn();
    const r = createWriteRefresher(["createTask"], refresh);
    r.onToolEnd({ toolName: "searchGrants", isError: false });
    r.onToolEnd({ toolName: "createTask", isError: true });
    r.onToolEnd({ toolName: "updateWorkingMemory", isError: false });
    vi.advanceTimersByTime(1000);
    expect(refresh).not.toHaveBeenCalled();
  });

  it("drops a pending refresh when cancelled", () => {
    const refresh = vi.fn();
    const r = createWriteRefresher(["createTask"], refresh);
    r.onToolEnd({ toolName: "createTask", isError: false });
    r.cancel();
    vi.advanceTimersByTime(1000);
    expect(refresh).not.toHaveBeenCalled();
  });
});
