import {PublicKey, SystemProgram, Transaction} from "@solana/web3.js"
import { GrapeCollectionState, IDL } from "../../target/types/grape_collection_state"
import * as anchor from "@project-serum/anchor"
import {Program} from "@project-serum/anchor";
import bs58 from 'bs58';
import {deserializeTokenAccount} from "./tokenAccountUtils";
import {ASSOCIATED_TOKEN_PROGRAM_ID, TOKEN_PROGRAM_ID} from "@solana/spl-token";
import BN from "bn.js";
const CONFIGURATION_KEY = 'Aqaf2YUnJmqVk85tdQU3XFZmiTEnyaTtgGtGA6yFRDKk'
const PROGRAM_ID = '8Dk32gShk85fpj2xDC99p3svCrWDuJf8tQ9JWWfddev3'
const GRAPE_MARKETPLACE_TOKEN = '2ForzAxeVUUCh7TaQQRudoGkjMbJiQUmjhuyq6mkhyTp'
// space: 8 discriminator + 4 name length + 200 name + 32 verified_collection_address
// + 32 collection_update_authority + 1 is_dao_approved
// + 32 auction_house + 32 admin_config + 4 meta_data_url length + 200 meta_data_url
// + 32 listing_requestor + 1 bump + 8 fee
const COLLECTION_BOARDING_INFO_SIZE = 8 + 4 + 200 + 32 + 32 + 1 + 32 + 32 + 4 + 200 + 32 + 1 + 8 + 4 + 40

export type CollectionBoardingInfo = {
    name: string, // Maximum 200 characters
    collection_update_authority: PublicKey,
    verified_collection_address?: PublicKey,
    governance?: PublicKey,
    auction_house: PublicKey,
    meta_data_url: string, // Maximum 200 characters
    vanity_url: string
    token_type: string
}

const getListingRequestFromCollectionAddress = async (seed: PublicKey, configurationKey: PublicKey) => {
    const [listingRequest, _] = await PublicKey.findProgramAddress(
        [configurationKey.toBuffer(),seed.toBuffer()],
        new PublicKey(PROGRAM_ID))
    return listingRequest
}

const approveOrDeny = async (provider: anchor.AnchorProvider,
                             program: Program<GrapeCollectionState>,
                             verifiedCollectionAddress: PublicKey,
                             configurationKey: PublicKey, approve: boolean,
                             topOff : Transaction | null = null) => {
    const listingRequest = await getListingRequestFromCollectionAddress(verifiedCollectionAddress, configurationKey)
    console.log("This is the PDA", listingRequest.toBase58())
    const listingRequestAccount = await program.account.collectionListingRequest.fetch(
        listingRequest
    )
    console.log("This is the acct", listingRequestAccount)
    let approveOrDenytx = await program.methods
        .approve(approve)
        .accounts({
            collectionBoardingInfo: listingRequest,
            admin: provider.wallet.publicKey,
            adminConfig: configurationKey,
            listingRequestor: listingRequestAccount.listingRequestor,
        }).transaction()
    if(topOff != null) {
        approveOrDenytx = approveOrDenytx.add(topOff)
    }
    return provider.sendAndConfirm(approveOrDenytx)
}

export const useManageAdmin = (provider : anchor.AnchorProvider) => {
    const program = new Program<GrapeCollectionState>(IDL, new PublicKey(PROGRAM_ID), provider)
    return {
        createConfig: async (fee: BN) => {
            const configKey = anchor.web3.Keypair.generate();
            return Promise.all([await program.methods
                .initializeConfig(provider.wallet.publicKey, fee)
                .accounts({
                    adminConfig: configKey.publicKey,
                    funder: provider.wallet.publicKey,
                    systemProgram: SystemProgram.programId,
                })
                .signers([configKey])
                .rpc(), configKey.publicKey.toBase58()])
        },
        updateAdmin: async (newAdminKey: PublicKey, adminConfig: PublicKey) => {
            return program.methods
                .updateConfig(newAdminKey)
                .accounts({
                    admin: provider.wallet.publicKey,
                    adminConfig: adminConfig,
                })
                .rpc();
        }
    }
}

export const useAdmin = (provider: anchor.AnchorProvider,  configurationKey = new PublicKey(CONFIGURATION_KEY)) => {
    const program = new Program<GrapeCollectionState>(IDL, new PublicKey(PROGRAM_ID), provider)
    return {
    approveListing: async (seed: PublicKey) => {
        return await approveOrDeny(provider, program, seed, configurationKey, true)
    },
    denyListing: async (seed: PublicKey) => {
        const [listingRequest, _bump] = await PublicKey.findProgramAddress(
            [configurationKey.toBuffer(),seed.toBuffer()],
            new PublicKey(PROGRAM_ID))
        console.log("This is the PDA", listingRequest.toBase58())
        // Check if listingRequest account has enough SOL to provide refund
        const listingRequestAccountInfo = await provider.connection.getAccountInfo(listingRequest);
        if (listingRequestAccountInfo == null)
        {
            throw Error(`Invalid listing request PDA ${listingRequest.toBase58()}`)
        }
        const listingRequestAccount = await program.account.collectionListingRequest.fetch(listingRequest);
        const rentExemption = await provider.connection.getMinimumBalanceForRentExemption(COLLECTION_BOARDING_INFO_SIZE);
        if(listingRequestAccountInfo.lamports < (listingRequestAccount.fee + rentExemption)) {
            //Fund account to provide refund
            let payFeeTx = new anchor.web3.Transaction().add(
                SystemProgram.transfer({
                    fromPubkey: provider.wallet.publicKey,
                    toPubkey: listingRequest,
                    lamports: (listingRequestAccount.fee.toNumber() + rentExemption) - listingRequestAccountInfo.lamports,
                })
            );
            return await approveOrDeny(provider, program, verifiedCollectionAddress, configurationKey, false, payFeeTx)
        }
        return await approveOrDeny(provider, program, verifiedCollectionAddress, configurationKey, false)
    }
}}

export const useListingRequest = (provider : anchor.AnchorProvider, configurationKey = new PublicKey(CONFIGURATION_KEY)) => {
    const program = new Program<GrapeCollectionState>(IDL, new PublicKey(PROGRAM_ID), provider)
    return {
        requestListng: async (collectionBoardingInfo: CollectionBoardingInfo) => {
            const listingRequest = await getListingRequestFromCollectionAddress(
                collectionBoardingInfo.verified_collection_address || collectionBoardingInfo.collection_update_authority,
                configurationKey)
            console.log('request', listingRequest.toBase58(), 'verified', (collectionBoardingInfo.verified_collection_address || collectionBoardingInfo.collection_update_authority).toBase58())

            // Get rent exemption listing requestor needs to pay
            const rentExemption = await provider.connection.getMinimumBalanceForRentExemption(COLLECTION_BOARDING_INFO_SIZE);

            // Get fee listing requestor needs to pay
            const adm = await program.account.config.fetch(configurationKey)

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
                    collectionBoardingInfo.governance!,
                    collectionBoardingInfo.meta_data_url,
                    collectionBoardingInfo.vanity_url,
                    collectionBoardingInfo.token_type
                )
                .accounts({
                    collectionBoardingInfo: listingRequest,
                    listingRequestor: provider.wallet.publicKey,
                    verifiedCollectionAddress: collectionBoardingInfo.verified_collection_address,
                    updateAuthority: collectionBoardingInfo.collection_update_authority,
                    seed: collectionBoardingInfo.verified_collection_address,
                    adminConfig: configurationKey,
                    systemProgram: SystemProgram.programId,
                }).transaction()
            const bothTx = payFeeTx.add(initTx)
            return Promise.all([provider.sendAndConfirm(bothTx), listingRequest.toBase58()])
        },
        requestListingRefund: async (seed: PublicKey) => {
            const listingRequest = await getListingRequestFromCollectionAddress(seed, configurationKey)
            return await program.methods
                .requestRefund()
                .accounts({
                    listingRequestor: provider.wallet.publicKey,
                    collectionBoardingInfo: listingRequest
                })
                .rpc();
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
            vanity_url: clr.vanityUrl,
            token_type: clr.tokenType
        }
    }))
}

export const useListingQuery = (provider : anchor.AnchorProvider, configurationKey = new PublicKey(CONFIGURATION_KEY)) => {
    const program = new Program<GrapeCollectionState>(IDL, new PublicKey(PROGRAM_ID), provider)
    const getLisingRequest = async (seed: PublicKey) => {
        const listingRequest = await getListingRequestFromCollectionAddress(seed, configurationKey)
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
        hasToken: async (seed: PublicKey) => {
            const clr = await getLisingRequest(seed)
            const [associatedTokenAccount, bump] = await PublicKey.findProgramAddress(
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