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

### App Proxy

The storefront accesses the merchant's settings through:

- /apps/cart-fee/settings

The App Proxy authenticates the storefront request and retrieves the settings for the current shop.

### Database

The app uses Prisma for storing merchant-specific settings.
Generate the Prisma client with:
- npx prisma generate