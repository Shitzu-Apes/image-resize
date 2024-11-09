import { KeyPair, connect, keyStores } from "near-api-js";
import type { KeyPairString } from "near-api-js/lib/utils/key_pair";
import { Env } from "..";

export async function viewWithNode<T>(
  node: string,
  contract: string,
  method: string,
  args: Record<string, unknown>
): Promise<T> {
  try {
    const res = await fetch(node, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "dontcare",
        method: "query",
        params: {
          request_type: "call_function",
          finality: "final",
          account_id: contract,
          method_name: method,
          args_base64: btoa(JSON.stringify(args)),
        },
      }),
    });

    const json = (await res.json()) as {
      error?: { data: string };
      result: { result: ArrayBuffer };
    };
    if ("error" in json) {
      console.error("[view]: Error", json.error!.data);
      throw new Error(json.error!.data);
    }

    const result = new Uint8Array(json.result.result);
    const decoder = new TextDecoder();

    return JSON.parse(decoder.decode(result));
  } catch (error: unknown) {
    console.error("[view]: Error", error);
    throw error;
  }
}

export async function createMemeToken(
  contractId: string,
  params: {
    name: string;
    symbol: string;
    decimals: number;
    durationMs: string;
    totalSupply: string;
    icon: string;
    softCap: string;
    hardCap?: string;
    teamAllocation?: {
      allocationBps: number;
      vestingDurationMs: number;
      cliffDurationMs: number;
    };
    referenceCID: string;
    referenceHash: string;
  },
  env: Env
) {
  const depositTokenId = env.WRAP_NEAR_CONTRACT_ID;

  // Connect to NEAR
  const keyStore = new keyStores.InMemoryKeyStore();
  const keyPair = KeyPair.fromString(env.PRIVATE_KEY as KeyPairString);
  await keyStore.setKey(env.NETWORK_ID, env.ACCOUNT_ID, keyPair);

  const config = {
    networkId: env.NETWORK_ID,
    keyStore,
    nodeUrl: env.NODE_URL,
  };

  const near = await connect(config);
  const account = await near.account(env.ACCOUNT_ID);

  // Calculate storage cost
  console.log("[createMemeToken]: Calculating storage cost", {
    NODE_URL: env.NODE_URL,
    contractId,
    args: {
      sender_id: account.accountId,
      duration_ms: params.durationMs,
      name: params.name,
      symbol: params.symbol,
      icon: params.icon,
      decimals: params.decimals,
      total_supply: params.totalSupply,
      reference: params.referenceCID,
      reference_hash: params.referenceHash,
      deposit_token_id: depositTokenId,
      soft_cap: params.softCap,
      hard_cap: params.hardCap,
    },
  });
  const storageCost = await viewWithNode<string>(
    env.NODE_URL,
    contractId,
    "create_meme_storage_cost",
    {
      sender_id: account.accountId,
      duration_ms: params.durationMs,
      name: params.name,
      symbol: params.symbol,
      icon: params.icon,
      decimals: params.decimals,
      total_supply: params.totalSupply,
      reference: params.referenceCID,
      reference_hash: params.referenceHash,
      deposit_token_id: depositTokenId,
      soft_cap: params.softCap,
      hard_cap: params.hardCap,
    }
  );

  // Create meme token
  return await account.functionCall({
    contractId,
    methodName: "create_meme",
    args: {
      duration_ms: params.durationMs,
      name: params.name,
      symbol: params.symbol,
      icon: params.icon,
      decimals: params.decimals,
      total_supply: params.totalSupply,
      reference: params.referenceCID,
      reference_hash: params.referenceHash,
      deposit_token_id: depositTokenId,
      soft_cap: params.softCap,
      hard_cap: params.hardCap,
      team_allocation: params.teamAllocation
        ? [
            params.teamAllocation.allocationBps,
            params.teamAllocation.vestingDurationMs,
            params.teamAllocation.cliffDurationMs,
          ]
        : undefined,
    },
    gas: BigInt(250000000000000),
    attachedDeposit: BigInt(storageCost),
  });
}
