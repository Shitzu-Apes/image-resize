import dotenv from "dotenv";
import { Sha256 } from "@aws-crypto/sha256-browser";

dotenv.config();

//reference_hash: the base64-encoded sha256 hash of the JSON file contained in the reference field. This is to guard against off-chain tampering.
export async function calculateReferenceHash(
  reference: string
): Promise<string> {
  const hash = new Sha256();

  hash.update(reference);
  const digest = await hash.digest();
  return btoa(String.fromCharCode(...digest));
}

export async function pinFileToIPFS(
  file: File,
  PINATA_JWT: string
): Promise<{
  IpfsHash: string;
  PinSize: number;
  Timestamp: string;
}> {
  const pinataForm = new FormData();
  pinataForm.append("file", file);
  const res = await fetch("https://api.pinata.cloud/pinning/pinFileToIPFS", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${PINATA_JWT}`,
    },
    body: pinataForm,
  });

  const json = (await res.json()) as {
    IpfsHash: string;
    PinSize: number;
    Timestamp: string;
    error?: {
      reason?: string;
    };
  };
  if (
    json.error &&
    json.error.reason &&
    typeof json.error.reason === "string"
  ) {
    throw new Error(json.error.reason);
  }
  return json;
}

export async function pinJSONToIPFS(
  json: Record<string, unknown>,
  PINATA_JWT: string
): Promise<{
  IpfsHash: string;
  PinSize: number;
  Timestamp: string;
}> {
  const res = await fetch("https://api.pinata.cloud/pinning/pinJSONToIPFS", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${PINATA_JWT}`,
    },
    body: JSON.stringify(json),
  });

  const jsonRes = (await res.json()) as {
    IpfsHash: string;
    PinSize: number;
    Timestamp: string;
    error?: {
      details?: string;
    };
  };
  if (
    jsonRes.error &&
    jsonRes.error.details &&
    typeof jsonRes.error.details === "string"
  ) {
    throw new Error(jsonRes.error.details);
  }
  return jsonRes;
}

export async function uploadToIPFS({
  imageFile,
  imageCID,
  referenceContent,
  PINATA_JWT,
}: {
  imageFile: File | null;
  imageCID: string | null;
  referenceContent: string;
  PINATA_JWT: string;
}) {
  if (!imageCID && !imageFile) {
    throw new Error("At least one of imageCID or imageFile is required");
  }

  if (!imageCID && imageFile) {
    const { IpfsHash } = await pinFileToIPFS(imageFile, PINATA_JWT);
    imageCID = IpfsHash;
  }

  const reference = { ...JSON.parse(referenceContent), image: imageCID };
  const { IpfsHash: referenceCID } = await pinJSONToIPFS(reference, PINATA_JWT);

  return {
    imageCID,
    referenceCID,
  };
}
