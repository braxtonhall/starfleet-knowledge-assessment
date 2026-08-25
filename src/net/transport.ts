import type { DataConnection, Peer } from "peerjs";
import type { HostMessage, PlayerMessage } from "./protocol";
import { peerIdFor } from "./roomCode";

/**
 * The WebRTC layer, and the only module that knows PeerJS exists. Sessions above
 * it deal in protocol messages; swapping brokers or transports should not reach
 * past this file.
 *
 * Signalling runs on PeerJS's public broker — the "public signaling server for
 * room discovery" of the spec preamble. Once a channel opens, question and
 * answer traffic is peer-to-peer and never touches it again.
 */

export type TransportErrorKind =
  /** The room code is already claimed on the broker. */
  | "taken"
  /** No host is listening on that room code. */
  | "missing"
  /** Broker unreachable, or WebRTC could not establish a channel. */
  | "network";

/** PeerJS is ~60KB that a solo player never needs, so it loads on demand. */
let peerModule: Promise<typeof import("peerjs")> | null = null;

function loadPeerJs(): Promise<typeof import("peerjs")> {
  peerModule ??= import("peerjs");
  return peerModule;
}

function classify(error: { type?: string }): TransportErrorKind {
  if (error.type === "unavailable-id") return "taken";
  if (error.type === "peer-unavailable") return "missing";
  return "network";
}

export interface HostTransport {
  sendTo(channelId: string, message: HostMessage): void;
  broadcast(message: HostMessage): void;
  disconnect(channelId: string): void;
  destroy(): void;
}

export interface HostTransportHandlers {
  /** The room code is claimed and the broker is listening. */
  onReady(): void;
  onError(kind: TransportErrorKind, detail: string): void;
  onOpen(channelId: string): void;
  onMessage(channelId: string, message: PlayerMessage): void;
  onClose(channelId: string): void;
}

export function createHostTransport(
  roomCode: string,
  handlers: HostTransportHandlers,
): HostTransport {
  const channels = new Map<string, DataConnection>();
  let peer: Peer | null = null;
  let destroyed = false;

  void loadPeerJs()
    .then(({ Peer: PeerCtor }) => {
      if (destroyed) return;
      peer = new PeerCtor(peerIdFor(roomCode));

      peer.on("open", () => handlers.onReady());
      peer.on("error", (error) => handlers.onError(classify(error), error.message));
      // The broker dropping us costs nothing in-flight — established data
      // channels keep working — but without it no new player can join.
      peer.on("disconnected", () => {
        if (!destroyed) peer?.reconnect();
      });

      peer.on("connection", (connection) => {
        const id = connection.connectionId;
        connection.on("open", () => {
          channels.set(id, connection);
          handlers.onOpen(id);
        });
        connection.on("data", (data) => {
          handlers.onMessage(id, data as PlayerMessage);
        });
        connection.on("close", () => {
          channels.delete(id);
          handlers.onClose(id);
        });
        connection.on("error", () => {
          channels.delete(id);
          handlers.onClose(id);
        });
      });
    })
    .catch((error: unknown) => handlers.onError("network", String(error)));

  return {
    sendTo(channelId, message) {
      const connection = channels.get(channelId);
      if (connection?.open) connection.send(message);
    },
    broadcast(message) {
      for (const connection of channels.values()) {
        if (connection.open) connection.send(message);
      }
    },
    disconnect(channelId) {
      channels.get(channelId)?.close();
      channels.delete(channelId);
    },
    destroy() {
      destroyed = true;
      for (const connection of channels.values()) connection.close();
      channels.clear();
      peer?.destroy();
      peer = null;
    },
  };
}

export interface PlayerTransport {
  send(message: PlayerMessage): void;
  destroy(): void;
}

export interface PlayerTransportHandlers {
  onOpen(): void;
  onMessage(message: HostMessage): void;
  onClose(): void;
  onError(kind: TransportErrorKind, detail: string): void;
}

export function createPlayerTransport(
  roomCode: string,
  handlers: PlayerTransportHandlers,
): PlayerTransport {
  let peer: Peer | null = null;
  let connection: DataConnection | null = null;
  let destroyed = false;

  void loadPeerJs()
    .then(({ Peer: PeerCtor }) => {
      if (destroyed) return;
      // No id argument: the broker assigns the player one. Only the host needs a
      // guessable identity.
      peer = new PeerCtor();

      peer.on("error", (error) => handlers.onError(classify(error), error.message));
      peer.on("open", () => {
        if (destroyed || !peer) return;
        connection = peer.connect(peerIdFor(roomCode), { reliable: true });
        connection.on("open", () => handlers.onOpen());
        connection.on("data", (data) => handlers.onMessage(data as HostMessage));
        connection.on("close", () => handlers.onClose());
        connection.on("error", () => handlers.onClose());
      });
    })
    .catch((error: unknown) => handlers.onError("network", String(error)));

  return {
    send(message) {
      if (connection?.open) connection.send(message);
    },
    destroy() {
      destroyed = true;
      connection?.close();
      connection = null;
      peer?.destroy();
      peer = null;
    },
  };
}
