# Shopify Cart Fee

A Shopify app that allows merchants to configure and display a cart fee on the storefront.

### Requirements

- Node.js
- npm
- Shopify CLI
- Shopify development store

### Installation

Clone the repository and install dependencies:
- npm install

Log in to Shopify:
- shopify auth login

Start the development environment:
- shopify app dev

### Features

* Enable or disable the cart fee.
* Configure the fee title.
* Configure the fee subtitle.
* Configure the fee value.
* Configure the fee text appearence.
* Display the fee as a Theme App Block on the Cart page.
* Calculate the fee based on the current cart value.
* Support the storefront's active currency when displaying the fee.

The block can be added from:
```text
Online Store → Themes → Customize → Cart template (Cart page) → Add block Apps → Cart Fee
```
### App Proxy

The storefront accesses the merchant's settings through:

- /apps/cart-fee/settings

The App Proxy authenticates the storefront request and retrieves the settings for the current shop.

### Database

The app uses Prisma for storing merchant-specific settings.
Generate the Prisma client with:
- npx prisma generate

## For developers
Fixing the migration history:
- npx prisma validate
- npx prisma migrate dev
- npx prisma generate