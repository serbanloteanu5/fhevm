use alloy::primitives::U256;
use connector_utils::types::KmsResponse;
use sqlx::{Pool, Postgres, postgres::PgQueryResult};
use tracing::{info, warn};
use futures::Future;

pub trait KmsResponsePublisher {
    fn publish(&self, response: KmsResponse) -> Box<dyn Future<Output = anyhow::Result<()>> + Send + '_>;
}

#[derive(Clone)]
pub struct DbKmsResponsePublisher {
    db_pool: Pool<Postgres>,
}

impl DbKmsResponsePublisher {
    pub fn new(db_pool: Pool<Postgres>) -> Self {
        Self { db_pool }
    }

    async fn publish_public_decryption(
        &self,
        decryption_id: U256,
        decrypted_result: Vec<u8>,
        signature: Vec<u8>,
    ) -> sqlx::Result<PgQueryResult> {
        sqlx::query!(
            "INSERT INTO public_decryption_responses VALUES ($1, $2, $3) ON CONFLICT DO NOTHING",
            decryption_id.as_le_slice(),
            decrypted_result,
            signature,
        )
        .execute(&self.db_pool)
        .await
    }

    async fn publish_user_decryption(
        &self,
        decryption_id: U256,
        user_decrypted_shares: Vec<u8>,
        signature: Vec<u8>,
    ) -> sqlx::Result<PgQueryResult> {
         sqlx::query!(
             "INSERT INTO user_decryption_responses VALUES ($1, $2, $3) ON CONFLICT DO NOTHING",
             decryption_id.as_le_slice(),
             user_decrypted_shares,
             signature
         )
         .execute(&self.db_pool)
         .await
     }
}

impl KmsResponsePublisher for DbKmsResponsePublisher {
    fn publish(&self, response: KmsResponse) -> Box<dyn Future<Output = anyhow::Result<()>> + Send + '_> {
       Box::new(async move {
           let response_str = response.to_string();
           info!("Storing {response_str} in DB...");
           
           let result = match &response {
               KmsResponse::PublicDecryption { decryption_id, decrypted_result, signature } => 
                   self.publish_public_decryption(*decryption_id,*decrypted_result.clone(),signature.clone()).await,
               KmsResponse::UserDecryption { decryption_id,user_decrypted_shares ,signature } =>
                   self.publish_user_decryption(*decription_id,user_decrypted_shares.clone(),signature.clone()).await,
           };

           let query_result = match result {
               Ok(res) => res,
               Err(e) => { 
                   response.free_associated_event(&self.db_pool).await; 
                   return Err(e.into());
               }
           };

           if query_result.rows_affected() == 1{
               info!("Successfully stored {response_str} in DB!");
           } else{
               warn!("Unexpected query result while publishing {} : {:?}", response_str , query_result);
           }
           
          Ok(())
       })
   }
}
