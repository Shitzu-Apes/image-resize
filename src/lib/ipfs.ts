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

const { PINATA_JWT } = process.env;

export async function pinFileToIPFS(file: File): Promise<{
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

  const json = await res.json();
  if (
    json.error &&
    json.error.reason &&
    typeof json.error.reason === "string"
  ) {
    throw new Error(json.error.reason);
  }
  return json;
}

export async function pinJSONToIPFS(json: Record<string, unknown>): Promise<{
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

  const jsonRes = await res.json();
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
}: {
  imageFile: File | null;
  imageCID: string | null;
  referenceContent: string;
}) {
  if (!imageCID && !imageFile) {
    throw new Error("At least one of imageCID or imageFile is required");
  }

  if (!imageCID && imageFile) {
    const { IpfsHash } = await pinFileToIPFS(imageFile);
    imageCID = IpfsHash;
  }

  const reference = { ...JSON.parse(referenceContent), image: imageCID };
  const { IpfsHash: referenceCID } = await pinJSONToIPFS(reference);

  return {
    imageCID,
    referenceCID,
  };
}
