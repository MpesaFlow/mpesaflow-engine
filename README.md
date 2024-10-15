# MpesaFlow ENGINE

MpesaFlow ENGINE is a comprehensive API designed to manage transactions, applications, and API keys for Mpesa services. This project is structured to support both sandbox and production environments, providing a robust solution for developers integrating Mpesa into their applications.

## Table of Contents

- [MpesaFlow ENGINE](#mpesaflow-engine)
  - [Table of Contents](#table-of-contents)
  - [Features](#features)
  - [Installation](#installation)
  - [Usage](#usage)
  - [API Endpoints](#api-endpoints)
    - [Applications](#applications)
    - [API Keys](#api-keys)
    - [Transactions](#transactions)
    - [Health Check](#health-check)
  - [Environment Variables](#environment-variables)
  - [Development](#development)
  - [License](#license)

## Features

- **Transaction Management**: Initiate and track Mpesa transactions.
- **Application Management**: Create and manage applications.
- **API Key Management**: Generate and revoke API keys.
- **Environment Support**: Separate configurations for sandbox and production environments.
- **Health Check**: Endpoint to verify API health.

## Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/mpesaflow.git
   cd mpesaflow
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Set up environment variables (see [Environment Variables](#environment-variables)).

## Usage

To start the API server, use the following npm scripts:

- **Sandbox Environment**:
  ```bash
  npm run deploy:sandbox
  ```

- **Production Environment**:
  ```bash
  npm run deploy:production
  ```

## API Endpoints

### Applications

- **Create Application**: `POST /apps/create`
- **List Applications**: `GET /apps/list`
- **Delete Application**: `DELETE /apps/{appId}`

### API Keys

- **Create API Key**: `POST /api-keys/create`
- **List API Keys**: `GET /api-keys/list`
- **Revoke API Key**: `DELETE /api-keys/{keyId}`

### Transactions

- **Initiate Paybill Transaction**: `POST /transactions/paybill`
- **Get Transaction Status**: `GET /transactions/status/{transactionId}`
- **List Transactions**: `GET /transactions/list`

### Health Check

- **Health Check**: `GET /health`

## Environment Variables

The application requires several environment variables to be set. These include:

- `CONSUMER_AUTH`
- `MPESA_OAUTH_URL`
- `MPESA_PROCESS_URL`
- `MPESA_QUERY_URL`
- `BUSINESS_SHORT_CODE`
- `PASS_KEY`
- `CONVEX_URL`
- `UNKEY_API_ID`
- `ALLOWED_ORIGIN`
- `BASELIME_API_KEY`
- `SERVICE_NAME`
- `ENVIRONMENT`
- `UNKEY_ROOT_ID`

Refer to the `src/types/honoTypes.ts` file for more details on the required environment variables.

## Development

To contribute to this project, follow these steps:

1. Fork the repository.
2. Create a new branch (`git checkout -b feature/your-feature`).
3. Make your changes.
4. Commit your changes (`git commit -m 'Add some feature'`).
5. Push to the branch (`git push origin feature/your-feature`).
6. Open a pull request.

## License

This project is licensed under the MIT License. See the [LICENSE.md](LICENSE.md) file for details.

