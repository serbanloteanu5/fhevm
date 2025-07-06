use crate::config::KmsWallet;
use alloy::{
    network::EthereumWallet,
    providers::{
        Identity, ProviderBuilder, ProviderLayer, RootProvider, WsConnect,
        fillers::{BlobGasFiller, ChainIdFiller, FillProvider, GasFiller, JoinFill, NonceFiller, TxFiller, WalletFiller},
    },
};
use anyhow::anyhow;
use sqlx::{Pool, Postgres, postgres::PgPoolOptions};
use std::time::Duration;
use tracing::{info,warn};

pub const CONNECTION_RETRY_NUMBER: usize = 5;
pub const CONNECTION_RETRY_DELAY: Duration = Duration::from_secs(2);

pub async fn connect_to_db(db_url: &str, db_pool_size: u32) -> anyhow::Result<Pool<Postgres>> {
    let options = PgPoolOptions::new().max_connections(db_pool_size);
    for i in 1..=CONNECTION_RETRY_NUMBER {
        info!("Attempting connection to DB... ({i}/{CONNECTION_RETRY_NUMBER})");
        match options.connect(db_url).await {
            Ok(db_pool) => {
                info!("Connected to Postgres database successfully");
                return Ok(db_pool);
            }
            Err(e) => warn!("DB connection attempt #{i} failed: {e}"),
        }
        if i != CONNECTION_RETRY_NUMBER {
            tokio::time::sleep(CONNECTION_RETRY_DELAY).await;
        }
    }
    Err(anyhow!("Could not connect to Postgres DB at url {db_url}"))
}

type DefaultFillers = JoinFill<
    Identity,
    JoinFill<GasFiller,
             JoinFill<BlobGasFiller,
                      JoinFill<NonceFiller,
                               ChainIdFiller>>>>;

pub type GatewayProvider = FillProvider<DefaultFillers, RootProvider>;
pub type WalletGatewayProvider =
    FillProvider<JoinFill<DefaultFillers, WalletFiller<EthereumWallet>>, RootProvider>;

async fn connect_to_gateway_inner<L,F>(
    gateway_url: &str,
    provider_builder_new: impl Fn() -> ProviderBuilder<L,F>,
) -> anyhow::Result<F::Provider>
where
   L: ProviderLayer<RootProvider>,
   F: ProviderLayer<L::Provider> + TxFiller
{
   for i in 1..=CONNECTION_RETRY_NUMBER {
       info!("Attempting connection to Gateway... ({i}/{CONNECTION_RETRY_NUMBER})");
       let ws_endpoint = WsConnect::new(gateway_url);
       match provider_builder_new().on_ws(ws_endpoint).await {
           Ok(provider) => {
               info!("Connected to Gateway's RPC node successfully");
               return Ok(provider);
           }
           Err(e) => warn!("Gateway connection attempt #{i} failed: {e}"),
       }
       if i != CONNECTION_RETRY_NUMBER {
           tokio::time.sleep(CONNECTION_RETRY_DELAY).await;
       }
   }
   Err(anyhow!("Could not connect to Gateway at url {gateway_url}"))
}

pub async fn connect_to_gateway(gateway_url:&str)->anyhow.Result<GatewayProvider>{
   connect_to_gateway_inner(gateway_url , ProviderBuilder::<Identity,_>::new ).await
}

pub async fn connect_to_gateway_with_wallet(
     gateway_url:&str ,
     wallet : KmsWallet ,
 ) -> anyhow.Result <WalletGatewayProvider> 
{
     connect_to_gateway_inner(gateway_url , ||{
         ProviderBuilder::<_, _>::new().wallet(wallet.clone())
     }).await
}
