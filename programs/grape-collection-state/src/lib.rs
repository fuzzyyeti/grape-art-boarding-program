use anchor_lang::prelude::*;

declare_id!("Es13ramf2tnaFFnvGe1A3vPQ7MJvG9G7kbBVwWwmuZP7");

#[program]
pub mod grape_collection_state {
    use super::*;

    pub fn initialize_listing_request(ctx: Context<InitializeListingRequest>,
                                      name: String,
                                      auction_house: Pubkey,
                                      governance: Option<Pubkey>,
                                      meta_data_url: String,
                                      vanity_url: String,
                                      token_type: String,
                                      request_type: u8) -> Result<()> {
        if let Some(pub_key) = governance {
            ctx.accounts.collection_boarding_info.governance = pub_key;
        } else {
            ctx.accounts.collection_boarding_info.governance = Pubkey::default();
        }
        let (listing_request_pda, _bump) = Pubkey::find_program_address(
            &[
                &ctx.accounts.admin_config.key().as_ref(),
                &ctx.accounts.seed.key().as_ref()],
            ctx.program_id
        );
        if listing_request_pda != ctx.accounts.collection_boarding_info.key()  {                         // Confirm if passed in PDA address is the same
            return Err(ErrorCode::StateInvalidAddress.into())
        }
        // Initialize colletion boarding data
        ctx.accounts.collection_boarding_info.name = name;
        ctx.accounts.collection_boarding_info.verified_collection_address = ctx.accounts.verified_collection_address.key();
        ctx.accounts.collection_boarding_info.collection_update_authority = ctx.accounts.update_authority.key();
        ctx.accounts.collection_boarding_info.auction_house = auction_house;
        ctx.accounts.collection_boarding_info.meta_data_url = meta_data_url;
        ctx.accounts.collection_boarding_info.vanity_url = vanity_url;
        ctx.accounts.collection_boarding_info.is_dao_approved = false;
        ctx.accounts.collection_boarding_info.enable = true;
        ctx.accounts.collection_boarding_info.request_type = request_type;
        ctx.accounts.collection_boarding_info.listing_requestor = ctx.accounts.listing_requestor.key();
        ctx.accounts.collection_boarding_info.bump = *ctx.bumps.get("collection_boarding_info").unwrap();
        ctx.accounts.collection_boarding_info.admin_config = ctx.accounts.admin_config.key();
        ctx.accounts.collection_boarding_info.fee = ctx.accounts.admin_config.fee;
        ctx.accounts.collection_boarding_info.token_type = token_type;
        Ok(())
    }

    pub fn enable(ctx: Context<Admin>, is_enabled: bool) -> Result<()> {
        ctx.accounts.collection_boarding_info.enable = is_enabled;
        Ok(())
    }

    pub fn approve(ctx: Context<Admin>, is_approved: bool) -> Result<()> {

        let admin = ctx.accounts.admin.to_account_info();
        let escrow = ctx.accounts.collection_boarding_info.to_account_info();
        let listing_requestor = ctx.accounts.listing_requestor.to_account_info();
        if is_approved {
            **escrow.try_borrow_mut_lamports()? -= ctx.accounts.admin_config.fee;
            **admin.try_borrow_mut_lamports()? += ctx.accounts.admin_config.fee;
        } else {
            **escrow.try_borrow_mut_lamports()? -= ctx.accounts.admin_config.fee;
            **listing_requestor.try_borrow_mut_lamports()? += ctx.accounts.admin_config.fee;
        }
        ctx.accounts.collection_boarding_info.is_dao_approved = is_approved;
        Ok(())
    }

    pub fn request_refund(ctx: Context<Refund>) -> Result<()> {

        let escrow = ctx.accounts.collection_boarding_info.to_account_info();
        let receiver = ctx.accounts.listing_requestor.to_account_info();
        **receiver.try_borrow_mut_lamports()? += escrow.try_lamports()?;
        **escrow.try_borrow_mut_lamports()? = 0;
        Ok(())
    }

    pub fn initialize_config(ctx: Context<InitializeConfig>, admin: Pubkey, fee: u64) -> Result<()> {
        ctx.accounts.admin_config.admin = admin;
        ctx.accounts.admin_config.fee = fee;
        Ok(())
    }

    pub fn update_config(ctx: Context<UpdateConfig>, new_admin: Pubkey) -> Result<()> {
        ctx.accounts.admin_config.admin = new_admin;
        Ok(())
    }

    pub fn set_fee(ctx: Context<UpdateConfig>, new_fee: u64) -> Result<()>{
        ctx.accounts.admin_config.fee = new_fee;
        Ok(())
    }

    pub fn update_metadata(ctx: Context<MetaDataMod>, new_metadata_url: String) -> Result<()>{
        ctx.accounts.collection_boarding_info.meta_data_url = new_metadata_url;
        Ok(())
    }
}


#[derive(Accounts)]
pub struct Refund<'info> {
    #[account(mut)]
    pub listing_requestor: Signer<'info>,
    #[account(mut, has_one = listing_requestor)]
    pub collection_boarding_info: Account<'info, CollectionListingRequest>
}

#[derive(Accounts)]
pub struct MetaDataMod<'info> {
    #[account(constraint = modifier.key().eq(&collection_boarding_info.listing_requestor.key())
    || modifier.key().eq(&collection_boarding_info.collection_update_authority.key()))]
    pub modifier: Signer<'info>,
    #[account(mut)]
    pub collection_boarding_info: Account<'info, CollectionListingRequest>,
}

#[derive(Accounts)]
pub struct Admin<'info> {
    #[account(mut, has_one = admin_config)]
    pub collection_boarding_info: Account<'info, CollectionListingRequest>,
    #[account(mut)]
    pub admin: Signer<'info>,
    #[account(has_one = admin)]
    pub admin_config: Account<'info, Config>,
    #[account(mut, address = collection_boarding_info.listing_requestor)]
    /// CHECK: only adding sol on deny listing, so data is not relevant
    pub listing_requestor: UncheckedAccount<'info>
}

#[derive(Accounts)]
pub struct InitializeListingRequest<'info> {
    #[account(init,
    payer = listing_requestor,
    space = 8 + 32 + 32 + 1 + 1 + 1 + 32 + 32 + 32 + 32 + 8 + 4 + 100 + 4 + 200 + 4 + 40 + 4 + 200 + 1,
    seeds = [admin_config.key().as_ref(), seed.key().as_ref()],
    bump)]
    pub collection_boarding_info: Account<'info, CollectionListingRequest>,
    #[account(mut)]
    pub listing_requestor: Signer<'info>,
    /// CHECK: This is used to identify the collection, but the data is not used
    pub verified_collection_address: UncheckedAccount<'info>,
    /// CHECK: This is used to identify the collection, but the data is not used
    pub update_authority: UncheckedAccount<'info>,
    /// CHECK: This is used as a seed to generate the PDA. The data does not matter
    #[account(constraint = seed.key() == update_authority.key() || seed.key() == verified_collection_address.key())]
    pub seed: UncheckedAccount<'info>,
    pub admin_config: Account<'info, Config>,
    pub system_program: Program<'info, System>,
}


#[derive(Accounts)]
pub struct InitializeConfig<'info> {
    #[account(init,
    payer = funder,
    space = 8 + 32 + 8)]
    pub admin_config: Account<'info, Config>,
    #[account(mut)]
    pub funder: Signer<'info>,
    pub system_program: Program<'info, System>
}

#[derive(Accounts)]
pub struct UpdateConfig<'info> {
    #[account(mut, has_one = admin)]
    pub admin_config: Account<'info, Config>,
    #[account(mut)]
    pub admin: Signer<'info>
}

#[account]
pub struct Config {
    admin: Pubkey,
    fee: u64
}

#[account]
pub struct CollectionListingRequest {
    // Collection related public keys
    verified_collection_address: Pubkey, // 32
    collection_update_authority: Pubkey, //32
    is_dao_approved: bool, // 1
    enable: bool, // 1
    request_type: u8, // 1
    auction_house: Pubkey, // 32
    governance: Pubkey, // 32
    // Properties for management
    admin_config: Pubkey, // 32
    listing_requestor: Pubkey, // 32
    fee: u64, // 8
    // Collection information
    name: String, // 4 + 100
    vanity_url: String, // 4 + 200
    token_type: String, // 4 + 40
    meta_data_url: String, // 4 + 200
    // Account validation information
    bump: u8 // 1
}
