import { MessageHandler } from "../src/websocket/message-handler";

describe("MessageHandler", () => {
  beforeEach(() => localStorage.clear());

  it("ignores non-JSON without throwing", async () => {
    const h = new MessageHandler("node1", true);
    await expect(h.handle("not json")).resolves.toBeUndefined();
  });

  it("ignores control frames with no url", async () => {
    const h = new MessageHandler("node1", false);
    await expect(
      h.handle(JSON.stringify({ type_event: "heartbeat" }))
    ).resolves.toBeUndefined();
  });

  it("invokes the disconnect_device callback", async () => {
    const onDisconnect = jest.fn();
    const h = new MessageHandler("node1", false, onDisconnect);
    await h.handle(JSON.stringify({ type_event: "disconnect_device" }));
    expect(onDisconnect).toHaveBeenCalledTimes(1);
  });

  it("does not execute jobs in logOnly mode", async () => {
    const h = new MessageHandler("node1", true);
    // a real job shape, but logOnly => no fetch should be attempted
    const fetchMock = jest.fn();
    (global as any).fetch = fetchMock;
    await h.handle(
      JSON.stringify({ url: "https://example.com", recordID: "r1" })
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
