import * as signalR from "@microsoft/signalr";
import type { ShareBundle } from "./types";

export type HubHandlers = {
  onShareCreated: (share: ShareBundle) => void;
  onShareDeleted: (shareId: string) => void;
  onShareUpdated: (share: ShareBundle) => void;
  onDisconnected: () => void;
  onReconnected: () => void;
};

function mapBundle(t: Record<string, unknown>): ShareBundle {
  const files = (t.files as Record<string, unknown>[] | undefined)?.map((f) => ({
    id: String(f.id),
    originalFileName: String(f.originalFileName),
    sizeBytes: Number(f.sizeBytes),
    contentType: String(f.contentType),
    relativePath: f.relativePath ? String(f.relativePath) : undefined,
  })) ?? [];

  return {
    id: String(t.id),
    title: String(t.title),
    authorName: String(t.authorName),
    authorId: String(t.authorId),
    createdAt: String(t.createdAt),
    fileCount: Number(t.fileCount),
    totalSizeBytes: Number(t.totalSizeBytes),
    files,
  };
}

export function createHub(token: string, handlers: HubHandlers) {
  const connection = new signalR.HubConnectionBuilder()
    .withUrl(`/hubs/share?access_token=${encodeURIComponent(token)}`)
    .withAutomaticReconnect([0, 2000, 5000, 10000, 30000])
    .build();

  connection.on("ShareCreated", (t: Record<string, unknown>) => {
    handlers.onShareCreated(mapBundle(t));
  });

  connection.on("ShareDeleted", (shareId: string) => {
    handlers.onShareDeleted(shareId);
  });

  connection.on("ShareUpdated", (t: Record<string, unknown>) => {
    handlers.onShareUpdated(mapBundle(t));
  });

  connection.onreconnected(() => handlers.onReconnected());
  connection.onclose(() => handlers.onDisconnected());

  let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

  async function start() {
    await connection.start();
    heartbeatTimer = setInterval(() => {
      if (connection.state === signalR.HubConnectionState.Connected) {
        connection.invoke("Heartbeat").catch(() => {});
      }
    }, 25000);
  }

  async function stop() {
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    await connection.stop();
  }

  return { connection, start, stop };
}
