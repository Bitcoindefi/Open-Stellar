import { describe, expect, it } from "vitest"

import { createToastQueueState, dismissToast, enqueueToast } from "@/lib/notifications/toast-queue"

describe("toast-queue", () => {
  it("caps visible toasts at 3 and queues the rest", () => {
    let state = createToastQueueState()

    for (let i = 1; i <= 5; i += 1) {
      state = enqueueToast(state, {
        id: `toast-${i}`,
        title: `Toast ${i}`,
        message: `Message ${i}`,
      })
    }

    expect(state.visible.map((toast) => toast.id)).toEqual(["toast-1", "toast-2", "toast-3"])
    expect(state.queued.map((toast) => toast.id)).toEqual(["toast-4", "toast-5"])
  })

  it("promotes queued toasts as visible ones are dismissed", () => {
    let state = createToastQueueState()

    for (let i = 1; i <= 5; i += 1) {
      state = enqueueToast(state, {
        id: `toast-${i}`,
        title: `Toast ${i}`,
        message: `Message ${i}`,
      })
    }

    state = dismissToast(state, "toast-2")
    expect(state.visible.map((toast) => toast.id)).toEqual(["toast-1", "toast-3", "toast-4"])
    expect(state.queued.map((toast) => toast.id)).toEqual(["toast-5"])
  })
})
