import data from "virtual:langle-notices";
import { send } from "../../messaging/client";
import { getSetupStage } from "../../messaging/setup";
import { watchSettings } from "../../messaging/storage";
import { mountPage } from "../../ui/mount-page";
import { NoticesPage } from "./NoticesPage";

getSetupStage()
  .then((stage) =>
    mountPage(() => ({
      ...(stage === "ready" && { theme: { send, watchSettings } }),
      app: <NoticesPage data={data} />,
    })),
  )
  .catch((error: unknown) => console.error(error));
