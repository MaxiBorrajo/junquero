import { useQueryClient } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { waitUntilOpen } from "../../chain/publish";
import { contributeToGroup } from "../../chain/contributeFlow";
import { readTokenBalance, readTokenNonce } from "../../chain/reader";
import { Body, Button, ErrorText, Screen, Secondary, Title } from "../../components/ui";
import { t } from "../../i18n";
import { relayDepsFor } from "../../lib/relayHelpers";
import { useSession } from "../../session/SessionProvider";

type Phase = "idle" | "waiting" | "sending" | "done" | "failed";

export default function PublishDone() {
  const { confirmed, group, spec, own } = useLocalSearchParams<{ confirmed?: string; group?: string; spec?: string; own?: string }>();
  const { api, address } = useSession();
  const queryClient = useQueryClient();
  const wantsContribution = group === "1" && Boolean(own) && Boolean(spec);
  const [phase, setPhase] = useState<Phase>(wantsContribution ? "waiting" : "idle");
  const started = useRef(false);

  // El aporte inicial del que crea el grupo: espera a que el grupo exista en la cadena y lo suma.
  const contribute = useCallback(async () => {
    if (!wantsContribution || !address || !spec || !own) return;
    setPhase("waiting");
    try {
      const changa = await waitUntilOpen(api, spec, { attempts: 40, delayMs: 3000, statuses: ["funding", "open"] });
      if (!changa || changa.orderId === null) throw new Error("not_ready");
      setPhase("sending");
      const account = address as `0x${string}`;
      await contributeToGroup(
        { ...relayDepsFor(api, address), readBalance: () => readTokenBalance(account), readTokenNonce: () => readTokenNonce(account) },
        BigInt(changa.orderId),
        BigInt(own),
      );
      await queryClient.invalidateQueries();
      setPhase("done");
    } catch {
      setPhase("failed");
    }
  }, [wantsContribution, address, spec, own, api, queryClient]);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void contribute();
  }, [contribute]);

  const goToGroup = group === "1" && spec && (confirmed === "1" || wantsContribution);
  const busy = phase === "waiting" || phase === "sending";
  const body = group === "1" ? (confirmed === "1" ? t.publish.groupDone : t.publish.groupPending) : confirmed === "1" ? t.publish.doneBody : t.publish.donePending;

  return (
    <Screen
      back={false}
      footer={
        <Button
          label={goToGroup ? t.publish.goToGroup : t.publish.goToMine}
          icon={goToGroup ? "users" : "briefcase"}
          disabled={busy}
          onPress={() => (goToGroup ? router.replace({ pathname: "/changa/[specHash]", params: { specHash: spec as string } }) : router.replace("/my-changas"))}
        />
      }
    >
      <Title>{t.publish.doneTitle}</Title>
      <Body>{body}</Body>
      {wantsContribution ? (
        <>
          {phase === "waiting" ? <Secondary>{t.publish.ownContributionWaiting}</Secondary> : null}
          {phase === "sending" ? <Secondary>{t.publish.ownContributionSending}</Secondary> : null}
          {phase === "done" ? <Secondary>{t.publish.ownContributionDone}</Secondary> : null}
          {phase === "failed" ? (
            <>
              <ErrorText>{t.publish.ownContributionFailed}</ErrorText>
              <Button label={t.publish.ownContributionRetry} variant="secondary" icon="refresh" onPress={() => void contribute()} />
            </>
          ) : null}
        </>
      ) : null}
    </Screen>
  );
}
