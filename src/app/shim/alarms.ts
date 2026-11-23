import type { Bridge } from "../bridge/bridge";
import { createEvent } from "./events";

/** `browser.alarms` over native timers, which run while the app does. */
export function createAlarms(bridge: Bridge) {
  const onAlarm = createEvent<[unknown]>();
  bridge.on("alarms.onAlarm", ([alarm]) => {
    onAlarm.emit(alarm);
  });
  return {
    create: async (...args: unknown[]): Promise<void> => {
      await bridge.call("alarms.create", ...args);
    },
    get: (name: string) => bridge.call("alarms.get", name),
    clear: (name: string) => bridge.call("alarms.clear", name),
    onAlarm,
  };
}
