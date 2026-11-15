import { useQueryClient } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useRef } from "react";
import { runInitialContribution } from "../../chain/initialContribution";
import { contributeToGroup } from "../../chain/contributeFlow";
import { waitUntilOpen } from "../../chain/publish";
import { readTokenBalance, readTokenNonce } from "../../chain/reader";
import { Body, Button, Screen, Secondary, Title } from "../../components/ui";
import { useToast } from "../../components/Toast";
import { t } from "../../i18n";
import { relayDepsFor } from "../../lib/relayHelpers";
import { useSession } from "../../session/SessionProvider";

export default function PublishDone() {
  const { confirmed, group, spec, own } = useLocalSearchParams<{ confirmed?: string; group?: string; spec?: string; own?: string }>();
  const { api, address } = useSession();
  const queryClient = useQueryClient();
  const toast = useToast();
  const wantsContribution = group === "1" && Boolean(own) && Boolean(spec);
  const started = useRef(false);

  // El aporte inicial corre en segundo plano: se puede salir de esta pantalla y avisa con un cartel al terminar.
  useEffect(() => {
    if (!wantsContribution || !address || !spec || !own || started.current) return;
    started.current = true;
    const account = address as `0x${string}`;
    void runInitialContribution({
      key: spec,
      waitForGroup: async () => (await waitUntilOpen(api, spec, { attempts: 60, delayMs: 3000, statuses: ["funding", "open"] }))?.orderId ?? null,
      contribute: async (orderId) => {
        await contributeToGroup(
          { ...relayDepsFor(api, address), readBalance: () => readTokenBalance(account), readTokenNonce: () => readTokenNonce(account) },
          BigInt(orderId),
          BigInt(own),
        );
        await queryClient.invalidateQueries();
      },
      onSuccess: () => toast({ text: t.publish.ownContributionDone, tone: "success", icon: "wallet", durationMs: 7000 }),
      onFailure: () => toast({ text: t.publish.ownContributionFailed, tone: "error", durationMs: 9000 }),
    });
  }, [wantsContribution, address, spec, own, api, queryClient, toast]);

  const goToGroup = group === "1" && spec && (confirmed === "1" || wantsContribution);
  const body = group === "1" ? (confirmed === "1" ? t.publish.groupDone : t.publish.groupPending) : confirmed === "1" ? t.publish.doneBody : t.publish.donePending;

  return (
    <Screen
      back={false}
      footer={
        <Button
          label={goToGroup ? t.publish.goToGroup : t.publish.goToMine}
          icon={goToGroup ? "users" : "briefcase"}
          onPress={() => (goToGroup ? router.replace({ pathname: "/changa/[specHash]", params: { specHash: spec as string } }) : router.replace("/my-changas"))}
        />
      }
    >
      <Title>{t.publish.doneTitle}</Title>
      <Body>{body}</Body>
      {wantsContribution ? <Secondary>{t.publish.ownContributionBackground}</Secondary> : null}
    </Screen>
  );
}
