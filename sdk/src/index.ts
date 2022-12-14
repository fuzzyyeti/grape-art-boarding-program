import { PublicKey, SystemProgram } from "@solana/web3.js";
import {
  GrapeCollectionState,
  IDL,
} from "../../target/types/grape_collection_state";
import * as anchor from "@project-serum/anchor";
import { Program } from "@project-serum/anchor";
import { deserializeTokenAccount } from "./tokenAccountUtils";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import BN from "bn.js";
import {
  accountFilter,
  accountFilterByRequestor,
  approveOrDeny,
  COLLECTION_BOARDING_INFO_SIZE,
  getListingRequestFromCollectionAddress,
  PROGRAM_ID,
} from "./utils";
const CONFIGURATION_KEY = "GjBP4p7p8GNbekJgWLzhowUNXRuAHb2TSiCP8d4G7dvY";
const GRAPE_MARKETPLACE_TOKEN = "72sYUZCgcWZJR1UnNgwxCJdTRAARiEm9nFm5TFB5j2Nx";

export type CollectionBoardingInfo = {
  name: string; // Maximum 200 characters
  collection_update_authority: PublicKey;
  enabled: boolean;
  verified_collection_address?: PublicKey;
  governance?: PublicKey;
  auction_house: PublicKey;
  meta_data_url: string; // Maximum 200 characters
  vanity_url: string;
  token_type: string;
  listing_requester: PublicKey;
  request_type: number;
};

export const useManageAdmin = (provider: anchor.AnchorProvider) => {
  if (!provider) {
    return {
      createConfig: null,
      updateAdmin: null,
      updateFee: null,
    };
  }
  const program = new Program<GrapeCollectionState>(
    IDL,
    new PublicKey(PROGRAM_ID),
    provider
  );
  return {
    createConfig: async (fee: BN) => {
      const configKey = anchor.web3.Keypair.generate();
      return Promise.all([
        await program.methods
          .initializeConfig(provider.wallet.publicKey, fee)
          .accounts({
            adminConfig: configKey.publicKey,
            funder: provider.wallet.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .signers([configKey])
          .rpc(),
        configKey.publicKey.toBase58(),
      ]);
    },
    updateAdmin: async (newAdminKey: PublicKey, adminConfig: PublicKey) => {
      return program.methods
        .updateConfig(newAdminKey)
        .accounts({
          admin: provider.wallet.publicKey,
          adminConfig: adminConfig,
        })
        .rpc();
    },
    updateFee: async (fee: BN, adminConfig: PublicKey) => {
      return program.methods
        .setFee(fee)
        .accounts({
          admin: provider.wallet.publicKey,
          adminConfig: adminConfig,
        })
        .rpc();
    },
  };
};

export const useAdmin = (
  provider: anchor.AnchorProvider,
  configurationKey = new PublicKey(CONFIGURATION_KEY)
) => {
  if (!provider) {
    return {
      approveListing: null,
      denyListing: null,
      setEnableListing: null,
      isAdmin: null,
    };
  }
  const program = new Program<GrapeCollectionState>(
    IDL,
    new PublicKey(PROGRAM_ID),
    provider
  );
  return {
    approveListing: async (seed: PublicKey) => {
      return await approveOrDeny(
        provider,
        program,
        seed,
        configurationKey,
        true
      );
    },
    denyListing: async (seed: PublicKey) => {
      const [listingRequest, _bump] = await PublicKey.findProgramAddress(
        [configurationKey.toBuffer(), seed.toBuffer()],
        new PublicKey(PROGRAM_ID)
      );
      // Check if listingRequest account has enough SOL to provide refund
      const listingRequestAccountInfo =
        await provider.connection.getAccountInfo(listingRequest);
      if (listingRequestAccountInfo == null) {
        throw Error(`Invalid listing request PDA ${listingRequest.toBase58()}`);
      }
      const listingRequestAccount =
        await program.account.collectionListingRequest.fetch(listingRequest);
      const rentExemption =
        await provider.connection.getMinimumBalanceForRentExemption(
          COLLECTION_BOARDING_INFO_SIZE
        );
      if (
        listingRequestAccountInfo.lamports <
        listingRequestAccount.fee + rentExemption
      ) {
        //Fund account to provide refund
        let payFeeTx = new anchor.web3.Transaction().add(
          SystemProgram.transfer({
            fromPubkey: provider.wallet.publicKey,
            toPubkey: listingRequest,
            lamports:
              listingRequestAccount.fee.toNumber() +
              rentExemption -
              listingRequestAccountInfo.lamports,
          })
        );
        return await approveOrDeny(
          provider,
          program,
          seed,
          configurationKey,
          false,
          payFeeTx
        );
      }
      return await approveOrDeny(
        provider,
        program,
        seed,
        configurationKey,
        false
      );
    },
    setEnableListing: async (seed: PublicKey, isEnabled: boolean) => {
      const listingRequest = await getListingRequestFromCollectionAddress(
        seed,
        configurationKey
      );
      const listingRequestAccount =
        await program.account.collectionListingRequest.fetch(listingRequest);
      let enableOrDisabletx = await program.methods
        .enable(isEnabled)
        .accounts({
          collectionBoardingInfo: listingRequest,
          admin: provider.wallet.publicKey,
          adminConfig: configurationKey,
          listingRequestor: listingRequestAccount.listingRequestor,
        })
        .transaction();
      return provider.sendAndConfirm(enableOrDisabletx);
    },
    isAdmin: async (admin: PublicKey) => {
      const config = await program.account.config.fetch(configurationKey);
      return config.admin.equals(admin);
    },
  };
};

export const useListingRequest = (
  provider: anchor.AnchorProvider | null,
  configurationKey = new PublicKey(CONFIGURATION_KEY)
) => {
  if (!provider) {
    return {
      requestListing: null,
      requestListingRefund: null,
      updateMetadataUrl: null,
    };
  }
  const program = new Program<GrapeCollectionState>(
    IDL,
    new PublicKey(PROGRAM_ID),
    provider
  );
  return {
    requestListing: async (collectionBoardingInfo: CollectionBoardingInfo) => {
      const listingRequest = await getListingRequestFromCollectionAddress(
        collectionBoardingInfo.verified_collection_address ||
          collectionBoardingInfo.collection_update_authority,
        configurationKey
      );
      // Get rent exemption listing requestor needs to pay
      const rentExemption =
        await provider.connection.getMinimumBalanceForRentExemption(
          COLLECTION_BOARDING_INFO_SIZE
        );

      // Get fee listing requestor needs to pay
      const adm = await program.account.config.fetch(configurationKey);
      let payFeeTx = new anchor.web3.Transaction().add(
        SystemProgram.transfer({
          fromPubkey: provider.wallet.publicKey,
          toPubkey: listingRequest,
          lamports: adm.fee.toNumber() + rentExemption,
        })
      );
      const initTx = await program.methods
        .initializeListingRequest(
          collectionBoardingInfo.name,
          collectionBoardingInfo.auction_house,
          collectionBoardingInfo.governance || PublicKey.default,
          collectionBoardingInfo.meta_data_url,
          collectionBoardingInfo.vanity_url,
          collectionBoardingInfo.token_type,
          collectionBoardingInfo.request_type
        )
        .accounts({
          collectionBoardingInfo: listingRequest || PublicKey.default,
          listingRequestor: provider.wallet.publicKey,
          verifiedCollectionAddress:
            collectionBoardingInfo.verified_collection_address ||
            PublicKey.default,
          updateAuthority: collectionBoardingInfo.collection_update_authority,
          seed:
            collectionBoardingInfo.verified_collection_address ||
            collectionBoardingInfo.collection_update_authority,
          adminConfig: configurationKey,
          systemProgram: SystemProgram.programId,
        })
        .transaction();
      const bothTx = payFeeTx.add(initTx);
      return Promise.all([
        provider.sendAndConfirm(bothTx),
        listingRequest.toBase58(),
      ]);
    },
    requestListingRefund: async (seed: PublicKey) => {
      const listingRequest = await getListingRequestFromCollectionAddress(
        seed,
        configurationKey
      );
      return await program.methods
        .requestRefund()
        .accounts({
          listingRequestor: provider.wallet.publicKey,
          collectionBoardingInfo: listingRequest,
        })
        .rpc();
    },
    updateMetadataUrl: async (seed: PublicKey, newUrl: string) => {
      const listingRequest = await getListingRequestFromCollectionAddress(
        seed,
        configurationKey
      );
      return await program.methods
        .updateMetadata(newUrl)
        .accounts({
          modifier: provider.wallet.publicKey,
          collectionBoardingInfo: listingRequest,
        })
        .rpc();
    },
  };
};

export const useListingQuery = (
  provider: anchor.AnchorProvider | null,
  configurationKey = new PublicKey(CONFIGURATION_KEY)
) => {
  if (!provider) {
    return {
      getListingRequest: null,
      getAllApprovedListings: null,
      getAllPendingListings: null,
      getApprovedListings: null,
      getPendingListings: null,
      isApproved: null,
      hasToken: null,
    };
  }
  const program = new Program<GrapeCollectionState>(
    IDL,
    new PublicKey(PROGRAM_ID),
    provider
  );
  const getLisingRequest = async (seed: PublicKey) => {
    const listingRequest = await getListingRequestFromCollectionAddress(
      seed,
      configurationKey
    );
    return await program.account.collectionListingRequest.fetch(listingRequest);
  };
  return {
    //Must be approved by admin and token in listing requestor's wallet
    getAllApprovedListings: async (): Promise<CollectionBoardingInfo[]> => {
      return accountFilter(true, provider, program, configurationKey);
    },
    getAllPendingListings: async (): Promise<CollectionBoardingInfo[]> => {
      return accountFilter(false, provider, program, configurationKey);
    },

    getAllApprovedListingsByRequestor: async (): Promise<
      CollectionBoardingInfo[]
    > => {
      return accountFilterByRequestor(
        true,
        provider,
        program,
        configurationKey
      );
    },
    getAllPendingListingsByRequestor: async (): Promise<
      CollectionBoardingInfo[]
    > => {
      return accountFilterByRequestor(
        false,
        provider,
        program,
        configurationKey
      );
    },

    isApproved: async (verifiedCollectionAddress: PublicKey) => {
      const clr = await getLisingRequest(verifiedCollectionAddress);
      return clr.isDaoApproved;
    },
    hasToken: async (seed: PublicKey) => {
      const clr = await getLisingRequest(seed);
      const [associatedTokenAccount, bump] = await PublicKey.findProgramAddress(
        [
          clr.listingRequestor.toBuffer(),
          TOKEN_PROGRAM_ID.toBuffer(),
          new PublicKey(GRAPE_MARKETPLACE_TOKEN).toBuffer(),
        ],
        new PublicKey(ASSOCIATED_TOKEN_PROGRAM_ID)
      );
      try {
        const acct = await provider.connection.getAccountInfo(
          associatedTokenAccount
        );
        const res = await deserializeTokenAccount(acct!.data);
        return res.amount.gte(new BN(1));
      } catch (e) {
        return false;
      }
    },
  };
};
