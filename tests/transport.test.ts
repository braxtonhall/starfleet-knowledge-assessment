import { beforeEach, describe, expect, it, vi } from "vitest";

const peers = vi.hoisted(() => [] as FakePeer[]);

class FakeConnection {
  open = false;
  private listeners = new Map<string, Array<(...args: unknown[]) => void>>();

  on(event: string, listener: (...args: unknown[]) => void): void {
    const callbacks = this.listeners.get(event) ?? [];
    callbacks.push(listener);
    this.listeners.set(event, callbacks);
  }

  emit(event: string, ...args: unknown[]): void {
    for (const listener of this.listeners.get(event) ?? []) listener(...args);
  }

  close(): void {
    this.open = false;
    this.emit("close");
  }

  send(): void {}
}

class FakePeer {
  connections: FakeConnection[] = [];
  private listeners = new Map<string, Array<(...args: unknown[]) => void>>();

  constructor() {
    peers.push(this);
  }

  on(event: string, listener: (...args: unknown[]) => void): void {
    const callbacks = this.listeners.get(event) ?? [];
    callbacks.push(listener);
    this.listeners.set(event, callbacks);
  }

  emit(event: string, ...args: unknown[]): void {
    for (const listener of this.listeners.get(event) ?? []) listener(...args);
  }

  connect(): FakeConnection {
    const connection = new FakeConnection();
    this.connections.push(connection);
    return connection;
  }

  destroy(): void {}
}

vi.mock("peerjs", () => ({ Peer: FakePeer }));

import { createPlayerSession } from "../src/net/playerSession";
import { createPlayerTransport } from "../src/net/transport";

describe("player transport", () => {
  beforeEach(() => {
    peers.length = 0;
  });

  it("reports a PeerJS signaling disconnect so the session can retry", async () => {
    const onClose = vi.fn();
    const transport = createPlayerTransport("ENTERPRISE-2345", {
      onOpen: vi.fn(),
      onMessage: vi.fn(),
      onClose,
      onError: vi.fn(),
    });

    await vi.waitFor(() => expect(peers).toHaveLength(1));
    const peer = peers[0];
    peer.emit("open");
    const connection = peer.connections[0];
    connection.open = true;
    connection.emit("open");

    peer.emit("disconnected");

    expect(onClose).toHaveBeenCalledOnce();
    transport.destroy();
  });

  it("moves a player to the disbanded state when the host ends the room", async () => {
    const session = createPlayerSession({ roomCode: "ENTERPRISE-2345" });
    await vi.waitFor(() => expect(peers).toHaveLength(1));
    const peer = peers[0];
    peer.emit("open");
    const connection = peer.connections[0];
    connection.open = true;
    connection.emit("open");
    connection.emit("data", { type: "disbanded" });

    expect(session.getState().phase).toBe("disbanded");
    session.destroy();
  });
});
