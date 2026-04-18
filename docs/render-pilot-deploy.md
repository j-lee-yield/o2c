# Render Pilot Deploy Guide

This guide is for a first pilot deployment of the O2C stack on Render.

Important:

- Treat this as a pilot environment, not a broad production rollout.
- Use one friendly pilot customer first.
- Do not send SAP Business One links until the deployed environment is reachable over HTTPS and you have tested the invite flow yourself.

## What You Are Deploying

The stack has five parts:

1. `o2c-web` for the client-facing and operator-facing web pages
2. `o2c-api` for the API and integration callbacks
3. `o2c-worker` for background jobs
4. `o2c-postgres` for data
5. `o2c-redis` for shared runtime state

## Before You Start

You need:

- a GitHub repo for this code
- a Render account
- a domain name you control
- your existing integration credentials
- a safe place to store environment variables

## One-Time Repo Prep

This repo now includes:

- `render.yaml` at the repo root
- production `start` scripts in the `api`, `web`, and `worker` apps

## Step 1: Push The Latest Code To GitHub

From your machine:

1. make sure your latest changes are committed or otherwise available in the branch you want to deploy
2. push that branch to GitHub

## Step 2: Create The Render Blueprint

In Render:

1. click `New`
2. choose `Blueprint`
3. connect your GitHub repo
4. select the branch you want to deploy
5. Render should detect `render.yaml`

The blueprint will create:

- `o2c-web`
- `o2c-api`
- `o2c-worker`
- `o2c-postgres`
- `o2c-redis`

## Step 3: Fill In Environment Variables

Render will ask for all `sync: false` variables.

Set these for all services that request them:

- `DEFAULT_TENANT_SLUG`
- `JWT_ISSUER`
- `JWT_AUDIENCE`
- `JWT_PUBLIC_KEY`
- `JWT_PRIVATE_KEY`
- `CLIENT_CONNECT_LINK_SECRET`

Set these for `o2c-api`:

- `INTEGRATION_QUICKBOOKS_CLIENT_ID`
- `INTEGRATION_QUICKBOOKS_CLIENT_SECRET`
- `INTEGRATION_QUICKBOOKS_CONNECT_REDIRECT_URI`
- `INTEGRATION_QUICKBOOKS_CONNECT_DEFAULT_ENVIRONMENT`
- `INTEGRATION_BUSINESS_CENTRAL_BASE_URL`
- `INTEGRATION_BUSINESS_CENTRAL_CONNECT_CLIENT_ID`
- `INTEGRATION_BUSINESS_CENTRAL_CONNECT_CLIENT_SECRET`
- `INTEGRATION_BUSINESS_CENTRAL_CONNECT_REDIRECT_URI`
- `INTEGRATION_BUSINESS_CENTRAL_CONNECT_DEFAULT_ENVIRONMENT`
- any Gmail or other connector secrets you still need

Set this for `o2c-web`:

- `O2C_API_BASE_URL`

For the first deploy, set `O2C_API_BASE_URL` to the public Render URL of `o2c-api` after it exists.

Example:

- `https://o2c-api.onrender.com`

## Step 4: Finish The First Deploy

Let Render build all services.

Expected result:

- `o2c-web` is live
- `o2c-api` is live
- `o2c-worker` is live
- postgres is available
- redis is available

## Step 5: Add Custom Domains

Recommended:

- `app.yourdomain.com` -> `o2c-web`
- `api.yourdomain.com` -> `o2c-api`

In Render:

1. open the service
2. go to `Settings`
3. go to `Custom Domains`
4. add the domain
5. follow the DNS instructions shown by Render

## Step 6: Update OAuth Callback URLs

After custom domains are working, update provider settings.

QuickBooks:

- set redirect URI to `https://api.yourdomain.com/v1/integrations/quickbooks/callback`

Business Central:

- set redirect URI to `https://api.yourdomain.com/v1/integrations/business-central/callback`

Then update the same values in Render env vars for `o2c-api`.

## Step 7: Set The Web App To Use The Production API URL

In `o2c-web`, set:

- `O2C_API_BASE_URL=https://api.yourdomain.com`

Redeploy `o2c-web` after changing it.

## Step 8: Sanity Check The Live App Yourself

Before sending any customer link:

1. open the web app
2. generate a signed client invite
3. open the client link yourself
4. confirm the branded page loads
5. confirm the Yield logo loads
6. confirm the SAP modal opens
7. confirm cancel returns to the page
8. confirm the inspector page opens

## Step 9: Send One Pilot Link Only

Use one friendly pilot customer first.

For SAP Business One:

1. send the signed client link
2. ask the customer to enter their own Service Layer details
3. stay online during the test
4. watch the `o2c-api` and `o2c-web` logs in Render

## Step 10: What To Check During The Pilot

You want to see:

- the customer returns to `/connect/accounting?...`
- the SAP card changes state
- pulled data appears
- invoices, customers, and payments load without errors

If it fails:

- copy the exact error message
- stop sending more links
- fix the issue before the next pilot
