/**
 * Shopify GraphQL Queries
 *
 * Queries for customer verification via Admin API.
 */

/**
 * Get customer by email address
 */
export const GET_CUSTOMER_BY_EMAIL = `
  query GetCustomerByEmail($query: String!) {
    customers(first: 1, query: $query) {
      edges {
        node {
          id
          legacyResourceId
          email
          firstName
          lastName
          state
          numberOfOrders
          amountSpent {
            amount
            currencyCode
          }
          tags
          note
          orders(first: 5, reverse: true) {
            edges {
              node {
                id
                name
                createdAt
                displayFinancialStatus
                displayFulfillmentStatus
              }
            }
          }
        }
      }
    }
  }
`;

/**
 * Get order by order number (name)
 * Order names in Shopify are like "#1234" or "SWA-1234"
 * Includes fulfillment and tracking details for action-oriented responses
 */
export const GET_ORDER_BY_NUMBER = `
  query GetOrderByNumber($query: String!) {
    orders(first: 1, query: $query) {
      edges {
        node {
          id
          name
          email
          createdAt
          displayFinancialStatus
          displayFulfillmentStatus
          tags
          note
          shippingAddress {
            city
            provinceCode
            country
          }
          fulfillments(first: 5) {
            id
            status
            createdAt
            updatedAt
            trackingInfo {
              company
              number
              url
            }
          }
          lineItems(first: 10) {
            edges {
              node {
                title
                quantity
                sku
              }
            }
          }
          customer {
            id
            email
            firstName
            lastName
            state
            numberOfOrders
            amountSpent {
              amount
              currencyCode
            }
            tags
            note
          }
        }
      }
    }
  }
`;

/**
 * Get customer orders
 */
export const GET_CUSTOMER_ORDERS = `
  query GetCustomerOrders($customerId: ID!, $first: Int!) {
    customer(id: $customerId) {
      orders(first: $first, reverse: true) {
        edges {
          node {
            id
            name
            email
            createdAt
            displayFinancialStatus
            displayFulfillmentStatus
            tags
            note
          }
        }
      }
    }
  }
`;
