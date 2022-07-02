
import {LAMPORTS_PER_SOL, PublicKey, SystemProgram} from "@solana/web3.js"
import { GrapeCollectionState, IDL } from "../../target/types/grape_collection_state"
import * as anchor from "@project-serum/anchor"
import {Program} from "@project-serum/anchor";
import bs58 from 'bs58';
import {deserializeTokenAccount} from "./tokenAccountUtils";
import {ASSOCIATED_TOKEN_PROGRAM_ID, TOKEN_PROGRAM_ID} from "@solana/spl-token";
import BN from "bn.js";
const CONFIGURATION_KEY = '48Q8knLizS8LN9GTBqTnseUeoB7FsayJhpvX7QMHC166'
const PROGRAM_ID = '8Dk32gShk85fpj2xDC99p3svCrWDuJf8tQ9JWWfddev3'
const FEE = LAMPORTS_PER_SOL
const GRAPE_MARKETPLACE_TOKEN = '2ForzAxeVUUCh7TaQQRudoGkjMbJiQUmjhuyq6mkhyTp'
// space: 8 discriminator + 4 name length + 200 name + 32 verified_collection_address
// + 32 collection_update_authority + 1 is_dao_approved
// + 32 auction_house + 32 admin_config + 4 meta_data_url length + 200 meta_data_url
// + 32 listing_requestor + 1 bump
const COLLECTION_BOARDING_INFO_SIZE = 8 + 4 + 200 + 32 + 32 + 1 + 32 + 32 + 4 + 200 + 32 + 1


//8 + 4 + 200 +32 +32 + 1 +32

export type CollectionBoardingInfo = {
    name: string, // Maximum 200 characters
    verified_collection_address: PublicKey,
    collection_update_authority: PublicKey,
    auction_house: PublicKey,
    meta_data_url: string, // Maximum 200 characters
}

export const useManageAdmin = (provider : anchor.AnchorProvider) => {
    const program = new Program<GrapeCollectionState>(IDL, new PublicKey(PROGRAM_ID), provider)
    return {
        createConfig: async () => {
            const configKey = anchor.web3.Keypair.generate();
            return Promise.all([await program.methods
                .initializeConfig(provider.wallet.publicKey, LAMPORTS_PER_SOL)
                .accounts({
                    adminConfig: configKey.publicKey,
                    funder: provider.wallet.publicKey,
                    systemProgram: SystemProgram.programId,
                })
                .signers([configKey])
                .rpc(), configKey.publicKey.toBase58()])
        },
        updateAdmin: async (newAdmin: PublicKey) => {
        }
    }
}

export const useAdmin = (provider: anchor.AnchorProvider,  configurationKey = new PublicKey(CONFIGURATION_KEY)) => {
    const program = new Program<GrapeCollectionState>(IDL, new PublicKey(PROGRAM_ID), provider)
    return {
    approveListing: async (verifiedCollectionAddress: PublicKey) => {
        return await approveOrDeny(provider, program, verifiedCollectionAddress, configurationKey, true)
    },
    denyListing: async (verifiedCollectionAddress: PublicKey) => {
        // TODO: Check if fee is needed and fund.
        return await approveOrDeny(provider, program, verifiedCollectionAddress, configurationKey, false)
    }
}}

const approveOrDeny = async (provider: anchor.AnchorProvider,
                       program: Program<GrapeCollectionState>,
                       verifiedCollectionAddress: PublicKey,
                       configurationKey: PublicKey, approve: boolean) => {
    const [listingRequest, seed] = await PublicKey.findProgramAddress(
        [configurationKey.toBuffer(),verifiedCollectionAddress.toBuffer()],
        new PublicKey(PROGRAM_ID))
    console.log("This is the PDA", listingRequest.toBase58())
    const listingRequestAccount = await program.account.collectionListingRequest.fetch(
        listingRequest
    );
    console.log("This is the acct", listingRequestAccount)
    return await program.methods
        .approve(approve)
        .accounts({
            collectionBoardingInfo: listingRequest,
            admin: provider.wallet.publicKey,
            adminConfig: configurationKey,
            listingRequestor: listingRequestAccount.listingRequestor,
        })
        .rpc();
}

export const useListingRequest = (provider : anchor.AnchorProvider, configurationKey = new PublicKey(CONFIGURATION_KEY)) => {
    const program = new Program<GrapeCollectionState>(IDL, new PublicKey(PROGRAM_ID), provider)
    return {
        requestListng: async (collectionBoardingInfo: CollectionBoardingInfo) => {
            const [listingRequest, bump] = await PublicKey.findProgramAddress(
                [
                    configurationKey.toBuffer(),
                    collectionBoardingInfo.verified_collection_address.toBuffer(),
                ],
                new PublicKey(PROGRAM_ID)
            );
            console.log('request', listingRequest.toBase58(), 'verified', collectionBoardingInfo.verified_collection_address.toBase58())
            const rent_exemption = await provider.connection.getMinimumBalanceForRentExemption(COLLECTION_BOARDING_INFO_SIZE);
            let payFeeTx = new anchor.web3.Transaction().add(
                SystemProgram.transfer({
                    fromPubkey: provider.wallet.publicKey,
                    toPubkey: listingRequest,
                    lamports: FEE + rent_exemption,
                })
            );
            await provider.sendAndConfirm(payFeeTx)
            return Promise.all([await program.methods
                .initializeListingRequest(
                    collectionBoardingInfo.name,
                    collectionBoardingInfo.collection_update_authority,
                    collectionBoardingInfo.auction_house,
                    collectionBoardingInfo.meta_data_url
                )
                .accounts({
                    collectionBoardingInfo: listingRequest,
                    listingRequestor: provider.wallet.publicKey,
                    verifiedCollectionAddress: collectionBoardingInfo.verified_collection_address,
                    adminConfig: configurationKey,
                    systemProgram: SystemProgram.programId,
                })
                .rpc(), listingRequest.toBase58()])
        },
        requestRefund: async (verifiedCollectionAddress: PublicKey) => {
        }
    }
}

const accountFilter = async (approved: boolean, provider: anchor.AnchorProvider, program: anchor.Program<GrapeCollectionState>, configurationKey: PublicKey) => {
    const accounts = await provider.connection.getParsedProgramAccounts(new PublicKey(PROGRAM_ID),
        { filters: [{dataSize: COLLECTION_BOARDING_INFO_SIZE},

                {memcmp: {
                        offset: 105, bytes: configurationKey.toBase58()}},
                {memcmp: {
                        offset: 72, bytes: bs58.encode([approved ? 1 : 0])}}]})
    return Promise.all(accounts.map(async (acct) => {
        const clr = await program.account.collectionListingRequest.fetch(acct.pubkey)
        return {
            name: clr.name,
            verified_collection_address: clr.verifiedCollectionAddress,
            collection_update_authority: clr.collectionUpdateAuthority,
            auction_house: clr.auctionHouse,
            meta_data_url: clr.metaDataUrl, // Maximum 200 characters
        }
    }))
}

export const useListingQuery = (provider : anchor.AnchorProvider, configurationKey = new PublicKey(CONFIGURATION_KEY)) => {
    const program = new Program<GrapeCollectionState>(IDL, new PublicKey(PROGRAM_ID), provider)
    const getLisingRequest = async (verifiedCollectionAddress: PublicKey) => {
        const [listingRequest, bump] = await PublicKey.findProgramAddress(
            [
                configurationKey.toBuffer(),
                verifiedCollectionAddress.toBuffer(),
            ],
            new PublicKey(PROGRAM_ID)
        );
        return await program.account.collectionListingRequest.fetch(listingRequest)
    }
    return {
        //Must be approved by admin and token in listing requestor's wallet
        getAllApprovedListings: async () : Promise<CollectionBoardingInfo[]> => {
            return accountFilter(true, provider, program, configurationKey)

        },
        getAllPendingListings: async () : Promise<CollectionBoardingInfo[]> => {
            return accountFilter(false, provider, program, configurationKey)
        },

        isApproved: async (verifiedCollectionAddress: PublicKey) => {
            const clr = await getLisingRequest(verifiedCollectionAddress)
            return clr.isDaoApproved

        },
        hasToken: async (verifiedCollectionAddress: PublicKey) => {
            const clr = await getLisingRequest(verifiedCollectionAddress)
;            const [associatedTokenAccount, bump] = await PublicKey.findProgramAddress(
                [
                    clr.listingRequestor.toBuffer(),
                    TOKEN_PROGRAM_ID.toBuffer(),
                    new PublicKey(GRAPE_MARKETPLACE_TOKEN).toBuffer(),
                ],
                new PublicKey(ASSOCIATED_TOKEN_PROGRAM_ID)
            );
            try {
                const acct = await provider.connection.getAccountInfo(associatedTokenAccount)
                const res = await deserializeTokenAccount(acct!.data)
                return res.amount.gt(new BN(0))
            }
            catch (e) {
                return false
            }
        }
    }
}