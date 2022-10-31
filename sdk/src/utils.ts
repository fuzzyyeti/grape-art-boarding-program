import { PublicKey, Transaction } from "@solana/web3.js";
import bs58 from "bs58";
import * as anchor from "@project-serum/anchor";
import {
  GrapeCollectionState,
  IDL,
} from "../../target/types/grape_collection_state";

export const PROGRAM_ID = "FcCRwJNwHSEQnpsWof5RWsHPrEtaWVrRzb16C8CeAJwa";
export const getListingRequestFromCollectionAddress = async (
  seed: PublicKey,
  configurationKey: PublicKey
) => {
  const [listingRequest, _] = await PublicKey.findProgramAddress(
    [configurationKey.toBuffer(), seed.toBuffer()],
    new PublicKey(PROGRAM_ID)
  );
  return listingRequest;
};

export const COLLECTION_BOARDING_INFO_SIZE =
  8 +
  32 +
  32 +
  1 +
  1 +
  1 +
  32 +
  32 +
  32 +
  32 +
  8 +
  4 +
  100 +
  4 +
  200 +
  4 +
  40 +
  4 +
  200 +
  1;

export const approveOrDeny = async (
  provider: anchor.AnchorProvider,
  program: anchor.Program<GrapeCollectionState>,
  seed: PublicKey,
  configurationKey: PublicKey,
  approve: boolean,
  topOff: Transaction | null = null
) => {
  const listingRequest = await getListingRequestFromCollectionAddress(
    seed,
    configurationKey
  );
  const listingRequestAccount =
    await program.account.collectionListingRequest.fetch(listingRequest);
  let approveOrDenytx = await program.methods
    .approve(approve)
    .accounts({
      collectionBoardingInfo: listingRequest,
      admin: provider.wallet.publicKey,
      adminConfig: configurationKey,
      listingRequestor: listingRequestAccount.listingRequestor,
    })
    .transaction();
  if (topOff != null) {
    return provider.sendAndConfirm(topOff.add(approveOrDenytx));
  }
  return provider.sendAndConfirm(approveOrDenytx);
};

export const accountFilterByRequestor = async (
  approved: boolean,
  provider: anchor.AnchorProvider,
  program: anchor.Program<GrapeCollectionState>,
  configurationKey: PublicKey
) => {
  const accounts = await provider.connection.getParsedProgramAccounts(
    new PublicKey(PROGRAM_ID),
    {
      filters: [
        { dataSize: COLLECTION_BOARDING_INFO_SIZE },

        {
          memcmp: {
            offset: 8 + 32 + 32 + 1 + 1 + 1 + 32 + 32,
            bytes: configurationKey.toBase58(),
          },
        },
        {
          memcmp: {
            offset: 8 + 32 + 32,
            bytes: bs58.encode([approved ? 1 : 0]),
          },
        },
        {
          memcmp: {
            offset: 8 + 32 + 32 + 1 + 1 + 1 + 32 + 32 + 32,
            bytes: provider.wallet.publicKey.toBase58(),
          },
        },
      ],
    }
  );
  return Promise.all(
    accounts.map(async (acct) => {
      const clr = await program.account.collectionListingRequest.fetch(
        acct.pubkey
      );
      return {
        name: clr.name,
        enabled: clr.enable,
        verified_collection_address: clr.verifiedCollectionAddress,
        collection_update_authority: clr.collectionUpdateAuthority,
        auction_house: clr.auctionHouse,
        meta_data_url: clr.metaDataUrl, // Maximum 200 characters
        vanity_url: clr.vanityUrl,
        token_type: clr.tokenType,
        listing_requester: clr.listingRequestor,
        request_type: clr.requestType,
      };
    })
  );
};

export const accountFilter = async (
  approved: boolean,
  provider: anchor.AnchorProvider,
  program: anchor.Program<GrapeCollectionState>,
  configurationKey: PublicKey
) => {
  const accounts = await provider.connection.getParsedProgramAccounts(
    new PublicKey(PROGRAM_ID),
    {
      filters: [
        { dataSize: COLLECTION_BOARDING_INFO_SIZE },
        {
          memcmp: {
            offset: 8 + 32 + 32 + 1 + 1 + 1 + 32 + 32,
            bytes: configurationKey.toBase58(),
          },
        },
        {
          memcmp: {
            offset: 8 + 32 + 32,
            bytes: bs58.encode([approved ? 1 : 0]),
          },
        },
      ],
    }
  );
  return Promise.all(
    accounts.map(async (acct) => {
      const clr = await program.account.collectionListingRequest.fetch(
        acct.pubkey
      );
      return {
        name: clr.name,
        enabled: clr.enable,
        verified_collection_address: clr.verifiedCollectionAddress,
        collection_update_authority: clr.collectionUpdateAuthority,
        auction_house: clr.auctionHouse,
        meta_data_url: clr.metaDataUrl, // Maximum 200 characters
        vanity_url: clr.vanityUrl,
        token_type: clr.tokenType,
        listing_requester: clr.listingRequestor,
        request_type: clr.requestType,
      };
    })
  );
};
