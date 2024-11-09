import { convertImage } from "./lib/image";
import { z } from "zod";
import dotenv from "dotenv";

dotenv.config();

const { VITE_MEME_COOKING_CONTRACT_ID, ENDPOINT_SECRET } = process.env;

import { createMemeToken } from "./lib/near";
import { calculateReferenceHash, uploadToIPFS } from "./lib/ipfs";
// import { createMemeToken } from "$lib/server/createMemeToken.js";
// import { createMemeToken } from "$lib/server/createMemeToken.js";
// import { calculateReferenceHash } from "$lib/util/cid.js";

const CONTRACT_ID = VITE_MEME_COOKING_CONTRACT_ID;

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

async function validateAuthHeader(request: Request) {
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
    reference: formData.get("reference")
      ? JSON.parse(formData.get("reference") as string)
      : {
          description: "",
          twitterLink: "",
          telegramLink: "",
          website: "",
        },
  };

  return createTokenSchema.parse(rawData);
}

export async function POST(request: Request) {
  try {
    await validateAuthHeader(request);
    const formData = await request.formData();
    const validatedData = await parseAndValidateFormData(formData);

    const compressedImage = await convertImage(validatedData.icon);
    const imageFile = compressedImage
      ? await (async () => {
          const base64Data = compressedImage.split(",")[1];
          const mimeType = compressedImage
            .split(",")[0]
            .split(":")[1]
            .split(";")[0];

          const buffer = Buffer.from(base64Data, "base64");

          return new File([buffer], "icon", { type: mimeType });
        })()
      : null;

    const { referenceCID, imageCID } = await uploadToIPFS({
      imageFile,
      imageCID: null,
      referenceContent: JSON.stringify({
        ...validatedData.reference,
        image: "",
      }),
    });

    const referenceHash = await calculateReferenceHash(
      JSON.stringify({
        ...validatedData.reference,
        image: imageCID,
      })
    );

    const icon = await convertImage(validatedData.icon, 96, 96);

    const result = await createMemeToken(CONTRACT_ID!, {
      ...validatedData,
      icon,
      referenceCID,
      referenceHash,
    });

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

// async function fetch(request: Request) {
//   const {
//     image,
//     width,
//     height,
//     fitMethod,
//   }: {
//     image?: string;
//     width?: number;
//     height?: number;
//     fitMethod?: "contain" | "stretch";
//   } = await request.json();
//   if (
//     !image ||
//     (fitMethod != null && !["contain", "stretch"].includes(fitMethod))
//   ) {
//     return new Response(null, { status: 400 });
//   }
//   return new Response(`data:image/webp;base64,${convertedImage}`);
// }

export default {
  fetch: POST,
};
