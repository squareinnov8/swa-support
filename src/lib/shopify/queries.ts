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
 * Get order with full event timeline including returns and refunds
 * Used for displaying order events inline with support messages
 */
export const GET_ORDER_TIMELINE = `
  query GetOrderTimeline($query: String!) {
    orders(first: 1, query: $query) {
      edges {
        node {
          id
          name
          email
          createdAt
          processedAt
          displayFinancialStatus
          displayFulfillmentStatus
          cancelledAt
          cancelReason
          tags
          note
          totalPriceSet {
            shopMoney {
              amount
              currencyCode
            }
          }
          subtotalPriceSet {
            shopMoney {
              amount
              currencyCode
            }
          }
          totalRefundedSet {
            shopMoney {
              amount
              currencyCode
            }
          }
          shippingAddress {
            city
            provinceCode
            country
          }
          fulfillments(first: 10) {
            id
            status
            displayStatus
            createdAt
            updatedAt
            deliveredAt
            estimatedDeliveryAt
            inTransitAt
            trackingInfo {
              company
              number
              url
            }
          }
          refunds(first: 10) {
            id
            createdAt
            note
            totalRefundedSet {
              shopMoney {
                amount
                currencyCode
              }
            }
            refundLineItems(first: 10) {
              edges {
                node {
                  quantity
                  lineItem {
                    title
                    sku
                  }
                  restockType
                }
              }
            }
          }
          returns(first: 10) {
            edges {
              node {
                id
                status
                name
                returnLineItems(first: 10) {
                  edges {
                    node {
                      id
                      quantity
                      returnReason
                      customerNote
                    }
                  }
                }
                reverseFulfillmentOrders(first: 5) {
                  edges {
                    node {
                      id
                      status
                    }
                  }
                }
              }
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

/**
 * Get all products with pagination
 * Used for catalog sync
 */
export const GET_PRODUCTS = `
  query GetProducts($first: Int!, $after: String) {
    products(first: $first, after: $after) {
      pageInfo {
        hasNextPage
        endCursor
      }
      edges {
        node {
          id
          handle
          title
          descriptionHtml
          productType
          vendor
          status
          tags
          images(first: 1) {
            edges {
              node {
                url
              }
            }
          }
          variants(first: 100) {
            edges {
              node {
                id
                sku
                title
                price
                compareAtPrice
                inventoryQuantity
              }
            }
          }
        }
      }
    }
  }
`;
