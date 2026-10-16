use super::schema;
use shopify_function::prelude::*;
use shopify_function::Result;

#[derive(Deserialize, Default, PartialEq)]
#[shopify_function(rename_all = "camelCase")]
pub struct Configuration {
    enabled: bool,
    required: Option<bool>,
    fee_variant_id: String,
}

#[shopify_function]
fn cart_validations_generate_run(
    input: schema::cart_validations_generate_run::Input,
) -> Result<schema::CartValidationsGenerateRunResult> {
    let configuration = match input.shop().metafield() {
        Some(metafield) => metafield.json_value(),
        None => {
            return Ok(schema::CartValidationsGenerateRunResult {
                operations: vec![],
            })
        }
    };

    let has_merchandise = input.cart().lines().iter().any(|line| {
        match &line.merchandise() {
            schema::cart_validations_generate_run::input::cart::lines::Merchandise::ProductVariant(variant) => {
                variant.id() != &configuration.fee_variant_id
            }
            _ => true,
        }
    });
    let has_fee = input.cart().lines().iter().any(|line| {
        match &line.merchandise() {
            schema::cart_validations_generate_run::input::cart::lines::Merchandise::ProductVariant(variant) => {
                variant.id() == &configuration.fee_variant_id
            }
            _ => false,
        }
    });

    let errors = if is_fee_missing(configuration, has_merchandise, has_fee) {
        vec![schema::ValidationError {
            message: "A required fee is missing. Return to your cart to add it before checkout."
                .to_owned(),
            target: "$.cart".to_owned(),
        }]
    } else {
        vec![]
    };

    let operations = if errors.is_empty() {
        vec![]
    } else {
        vec![schema::Operation::ValidationAdd(
            schema::ValidationAddOperation { errors },
        )]
    };

    Ok(schema::CartValidationsGenerateRunResult {
        operations,
    })
}

fn is_fee_missing(configuration: &Configuration, has_merchandise: bool, has_fee: bool) -> bool {
    configuration.enabled
        && configuration.required.unwrap_or(false)
        && has_merchandise
        && !has_fee
}

#[cfg(test)]
mod tests {
    use super::{is_fee_missing, Configuration};

    fn configuration(enabled: bool, required: bool) -> Configuration {
        Configuration {
            enabled,
            required: Some(required),
            fee_variant_id: "gid://shopify/ProductVariant/fee".to_owned(),
        }
    }

    #[test]
    fn blocks_when_required_fee_is_missing() {
        assert!(is_fee_missing(&configuration(true, true), true, false));
    }

    #[test]
    fn allows_checkout_when_fee_is_present() {
        assert!(!is_fee_missing(&configuration(true, true), true, true));
    }

    #[test]
    fn allows_checkout_when_fee_is_optional_or_disabled() {
        assert!(!is_fee_missing(&configuration(true, false), true, false));
        assert!(!is_fee_missing(&configuration(false, true), true, false));
    }

    #[test]
    fn does_not_require_a_fee_for_an_empty_cart() {
        assert!(!is_fee_missing(&configuration(true, true), false, false));
    }
}
