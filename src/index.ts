import { convertImage } from "./lib/image";
import { z } from "zod";

import { createMemeToken } from "./lib/near";
import { calculateReferenceHash, uploadToIPFS } from "./lib/ipfs";

export interface Env {
  ENDPOINT_SECRET: string;
  NODE_URL: string;
  NETWORK_ID: string;
  PRIVATE_KEY: string;
  ACCOUNT_ID: string;
  PINATA_JWT: string;
  CONTRACT_ID: string;
  WRAP_NEAR_CONTRACT_ID: string;
}

const teamAllocationSchema = z.object({
  allocationBps: z.number(),
  vestingDurationMs: z.number(),
  cliffDurationMs: z.number(),
});

const referenceSchema = z.object({
  description: z.string(),
  twitterLink: z.string().optional().default(""),
  telegramLink: z.string().optional().default(""),
  website: z.string().optional().default(""),
  image: z.string().optional(),
});

const createTokenSchema = z.object({
  name: z.string().min(1),
  symbol: z.string().min(1),
  decimals: z.number().int().min(0),
  durationMs: z.string(),
  totalSupply: z.string(),
  icon: z.string(),
  softCap: z.string(),
  hardCap: z.string().optional(),
  teamAllocation: teamAllocationSchema.optional(),
  reference: referenceSchema.optional(),
});

async function validateAuthHeader(request: Request, env: Env) {
  const { ENDPOINT_SECRET } = env;
  const authHeader = request.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    throw new Error("Missing authorization header");
  }

  const token = authHeader.split(" ")[1];
  console.log("Token:", token, ENDPOINT_SECRET);
  if (token !== ENDPOINT_SECRET) {
    throw new Error("Invalid authorization token");
  }
}

async function parseAndValidateFormData(formData: FormData) {
  const referenceInput = formData.get("reference")
    ? JSON.parse(formData.get("reference") as string)
    : undefined;

  const reference = {
    description: referenceInput?.description,
    twitterLink: referenceInput?.twitterLink,
    telegramLink: referenceInput?.telegramLink,
    website: referenceInput?.website,
    image: referenceInput?.image,
  };

  const rawData = {
    name: formData.get("name"),
    symbol: formData.get("symbol"),
    decimals: parseInt(formData.get("decimals") as string),
    durationMs: formData.get("durationMs"),
    totalSupply: formData.get("totalSupply"),
    icon: formData.get("icon"),
    softCap: formData.get("softCap"),
    hardCap: formData.get("hardCap") || undefined,
    teamAllocation: formData.get("teamAllocation")
      ? JSON.parse(formData.get("teamAllocation") as string)
      : undefined,
    reference,
  };

  return createTokenSchema.parse(rawData);
}

export async function fetch(request: Request, env: Env) {
  try {
    await validateAuthHeader(request, env);
    const formData = await request.formData();
    const validatedData = await parseAndValidateFormData(formData);

    const compressedImage = await convertImage(validatedData.icon);
    const imageFile = compressedImage
      ? await (async () => {
          const base64Data = compressedImage;
          const byteString = atob(base64Data.split(",")[1]);
          const mimeType = base64Data.split(",")[0].split(":")[1].split(";")[0];

          const ab = new ArrayBuffer(byteString.length);
          const ia = new Uint8Array(ab);
          for (let i = 0; i < byteString.length; i++) {
            ia[i] = byteString.charCodeAt(i);
          }

          return new File([ab], "icon", { type: mimeType });
        })()
      : null;

    const { referenceCID, imageCID } = await uploadToIPFS({
      imageFile,
      imageCID: null,
      referenceContent: JSON.stringify({
        ...validatedData.reference,
        image: "",
      }),
      PINATA_JWT: env.PINATA_JWT,
    });

    const referenceHash = await calculateReferenceHash(
      JSON.stringify({
        ...validatedData.reference,
        image: imageCID,
      })
    );

    const icon = await convertImage(validatedData.icon, 96, 96);

    const result = await createMemeToken(
      env.CONTRACT_ID,
      {
        ...validatedData,
        icon,
        referenceCID,
        referenceHash,
      },
      env
    );

    return new Response(
      JSON.stringify({
        success: true,
        result,
      }),
      { status: 200 }
    );
  } catch (error) {
    console.error("Error creating token:", error);
    if (error instanceof z.ZodError) {
      return new Response(
        JSON.stringify({ success: false, error: error.errors }),
        { status: 400 }
      );
    }
    if (error instanceof Error && error.message.includes("authorization")) {
      return new Response(
        JSON.stringify({ success: false, error: error.message }),
        { status: 401 }
      );
    }
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      }),
      { status: 500 }
    );
  }
}

export default {
  fetch: fetch,
};
