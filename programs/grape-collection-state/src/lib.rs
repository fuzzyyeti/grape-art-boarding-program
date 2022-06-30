use anchor_lang::prelude::*;
use anchor_lang::solana_program::native_token::LAMPORTS_PER_SOL;

declare_id!("Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS");

const FEE: u64 = LAMPORTS_PER_SOL;
#[program]
pub mod grape_collection_state {
    use super::*;

    pub fn initialize_listing_request(ctx: Context<InitializeListingRequest>,
                      name: String,
                      collection_update_authority: Pubkey,
                      auction_house: Pubkey,
                      meta_data_url: String) -> Result<()> {

        // Initialize colletion boarding data
        ctx.accounts.collection_boarding_info.name = name;
        ctx.accounts.collection_boarding_info.verified_collection_address = ctx.accounts.verified_collection_address.key();
        ctx.accounts.collection_boarding_info.collection_update_authority = collection_update_authority;
        ctx.accounts.collection_boarding_info.auction_house = auction_house;
        ctx.accounts.collection_boarding_info.meta_data_url = meta_data_url;
        ctx.accounts.collection_boarding_info.is_dao_approved = false;
        ctx.accounts.collection_boarding_info.listing_requestor = ctx.accounts.listing_requestor.key();
        ctx.accounts.collection_boarding_info.bump = *ctx.bumps.get("collection_boarding_info").unwrap();
        ctx.accounts.collection_boarding_info.admin_config = ctx.accounts.admin_config.key();
        Ok(())
    }

    pub fn approve(ctx: Context<Admin>, is_approved: bool) -> Result<()> {

        let admin = ctx.accounts.admin.to_account_info();
        let escrow = ctx.accounts.collection_boarding_info.to_account_info();
        let listing_requestor = ctx.accounts.listing_requestor.to_account_info();
        if is_approved {
            **escrow.try_borrow_mut_lamports()? -= FEE;
            **admin.try_borrow_mut_lamports()? += FEE;
        } else {
            **escrow.try_borrow_mut_lamports()? -= FEE;
            **listing_requestor.try_borrow_mut_lamports()? += FEE;
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

    pub fn initialize_config(ctx: Context<InitializeConfig>, admin: Pubkey) -> Result<()> {
        ctx.accounts.admin_config.admin = admin;
        Ok(())
    }

    pub fn update_config(ctx: Context<UpdateConfig>, new_admin: Pubkey) -> Result<()> {
        ctx.accounts.admin_config.admin = new_admin;
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
pub struct Admin<'info> {
    #[account(mut, has_one = admin_config)]
    pub collection_boarding_info: Account<'info, CollectionListingRequest>,
    #[account(mut)]
    pub admin: Signer<'info>,
    #[account(has_one = admin)]
    pub admin_config: Account<'info, Config>,
    #[account(mut, address = collection_boarding_info.listing_requestor)]
    /// CHECK: only adding sol on un-approval, so data is not relevant
    pub listing_requestor: UncheckedAccount<'info>
}

#[derive(Accounts)]
pub struct InitializeListingRequest<'info> {
    #[account(init,
    payer = listing_requestor,
    // space: 8 discriminator + 4 name length + 200 name + 32 verified_collection_address
    // + 32 collection_update_authority + 1 is_dao_approved
    // + 32 auction_house + 32 admin_config + 4 meta_data_url length + 200 meta_data_url
    // + 32 listing_requestor + 1 bump
    space = 8 + 4 + 200 + 32 + 32 + 1 + 32 + 32 + 4 + 200 + 32 + 1,
    seeds = [b"collection-boarding", verified_collection_address.key().as_ref()],
    bump)]
    pub collection_boarding_info: Account<'info, CollectionListingRequest>,
    #[account(mut)]
    pub listing_requestor: Signer<'info>,
    /// CHECK: I don't know what I'm doing yet
    pub verified_collection_address: UncheckedAccount<'info>,
    pub admin_config: Account<'info, Config>,
    pub system_program: Program<'info, System>,
}


#[derive(Accounts)]
pub struct InitializeConfig<'info> {
    #[account(init,
    payer = funder,
    space = 8 + 32)]
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
    admin: Pubkey
}

#[account]
pub struct CollectionListingRequest {
    name: String,
    verified_collection_address: Pubkey,
    collection_update_authority: Pubkey,
    is_dao_approved: bool,
    auction_house: Pubkey,
    meta_data_url: String,
    admin_config: Pubkey,
    listing_requestor: Pubkey,
    bump: u8
}