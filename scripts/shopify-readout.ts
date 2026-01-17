/**
 * Shopify Store Readout
 *
 * Fetches shop metadata, products, and metafields to see what's available
 * for knowledge base population.
 */

import "dotenv/config";

const STORE_DOMAIN = process.env.SHOPIFY_STORE_DOMAIN;
const ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const API_VERSION = process.env.SHOPIFY_API_VERSION || "2024-01";

async function executeGraphQL<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
  const url = `https://${STORE_DOMAIN}/admin/api/${API_VERSION}/graphql.json`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": ACCESS_TOKEN!,
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Shopify API error: ${response.status} - ${text}`);
  }

  const result = await response.json();

  if (result.errors && result.errors.length > 0) {
    console.error("GraphQL Errors:", JSON.stringify(result.errors, null, 2));
  }

  return result.data;
}

// Query for shop info and metafields
const SHOP_QUERY = `
  query GetShopInfo {
    shop {
      name
      description
      primaryDomain {
        url
      }
      email
      currencyCode
      contactEmail
      billingAddress {
        city
        province
        country
      }
      metafields(first: 50) {
        edges {
          node {
            namespace
            key
            value
            type
          }
        }
      }
    }
  }
`;

// Query for products with metafields
const PRODUCTS_QUERY = `
  query GetProducts($first: Int!, $cursor: String) {
    products(first: $first, after: $cursor) {
      edges {
        node {
          id
          title
          handle
          description
          productType
          vendor
          tags
          status
          metafields(first: 20) {
            edges {
              node {
                namespace
                key
                value
                type
              }
            }
          }
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

// Query for collections
const COLLECTIONS_QUERY = `
  query GetCollections {
    collections(first: 50) {
      edges {
        node {
          id
          title
          handle
          description
          productsCount
          metafields(first: 10) {
            edges {
              node {
                namespace
                key
                value
                type
              }
            }
          }
        }
      }
    }
  }
`;

// Query for pages (content pages)
const PAGES_QUERY = `
  query GetPages {
    pages(first: 50) {
      edges {
        node {
          id
          title
          handle
          body
          bodySummary
          createdAt
          updatedAt
        }
      }
    }
  }
`;

// Query for blog articles
const BLOGS_QUERY = `
  query GetBlogs {
    blogs(first: 10) {
      edges {
        node {
          id
          title
          handle
          articles(first: 20) {
            edges {
              node {
                id
                title
                handle
                content
                summary
                tags
                publishedAt
              }
            }
          }
        }
      }
    }
  }
`;

async function main() {
  console.log("=".repeat(60));
  console.log("SHOPIFY STORE READOUT");
  console.log("=".repeat(60));
  console.log(`Store: ${STORE_DOMAIN}`);
  console.log(`API Version: ${API_VERSION}`);
  console.log("");

  // 1. Shop Info
  console.log("\n" + "=".repeat(60));
  console.log("SHOP INFO & METAFIELDS");
  console.log("=".repeat(60));

  try {
    const shopData = await executeGraphQL<any>(SHOP_QUERY);
    const shop = shopData?.shop;

    if (shop) {
      console.log(`Name: ${shop.name}`);
      console.log(`Description: ${shop.description || "(none)"}`);
      console.log(`Primary Domain: ${shop.primaryDomain?.url}`);
      console.log(`Email: ${shop.email}`);
      console.log(`Contact Email: ${shop.contactEmail}`);
      console.log(`Currency: ${shop.currencyCode}`);

      const metafields = shop.metafields?.edges || [];
      console.log(`\nShop Metafields (${metafields.length}):`);
      if (metafields.length === 0) {
        console.log("  (no shop metafields found)");
      } else {
        for (const { node } of metafields) {
          console.log(`  - ${node.namespace}.${node.key} [${node.type}]`);
          console.log(`    Value: ${node.value?.substring(0, 200)}${node.value?.length > 200 ? "..." : ""}`);
        }
      }
    }
  } catch (err) {
    console.error("Failed to fetch shop info:", err);
  }

  // 2. Products
  console.log("\n" + "=".repeat(60));
  console.log("PRODUCTS (first 20)");
  console.log("=".repeat(60));

  try {
    const productsData = await executeGraphQL<any>(PRODUCTS_QUERY, { first: 20 });
    const products = productsData?.products?.edges || [];

    console.log(`Found ${products.length} products\n`);

    let productsWithMetafields = 0;
    const metafieldNamespaces = new Set<string>();

    for (const { node } of products) {
      const metafields = node.metafields?.edges || [];
      if (metafields.length > 0) productsWithMetafields++;

      for (const { node: mf } of metafields) {
        metafieldNamespaces.add(mf.namespace);
      }

      console.log(`📦 ${node.title}`);
      console.log(`   Handle: ${node.handle}`);
      console.log(`   Type: ${node.productType || "(none)"}`);
      console.log(`   Status: ${node.status}`);
      console.log(`   Tags: ${node.tags?.slice(0, 5).join(", ")}${node.tags?.length > 5 ? "..." : ""}`);

      if (metafields.length > 0) {
        console.log(`   Metafields (${metafields.length}):`);
        for (const { node: mf } of metafields) {
          console.log(`     - ${mf.namespace}.${mf.key}: ${mf.value?.substring(0, 100)}...`);
        }
      }
      console.log("");
    }

    console.log(`\nSummary: ${productsWithMetafields}/${products.length} products have metafields`);
    console.log(`Metafield namespaces found: ${[...metafieldNamespaces].join(", ") || "(none)"}`);

  } catch (err) {
    console.error("Failed to fetch products:", err);
  }

  // 3. Collections
  console.log("\n" + "=".repeat(60));
  console.log("COLLECTIONS");
  console.log("=".repeat(60));

  try {
    const collectionsData = await executeGraphQL<any>(COLLECTIONS_QUERY);
    const collections = collectionsData?.collections?.edges || [];

    console.log(`Found ${collections.length} collections\n`);

    for (const { node } of collections) {
      console.log(`📁 ${node.title}`);
      console.log(`   Handle: ${node.handle}`);
      console.log(`   Products: ${node.productsCount}`);
      console.log(`   Description: ${node.description?.substring(0, 100) || "(none)"}...`);

      const metafields = node.metafields?.edges || [];
      if (metafields.length > 0) {
        console.log(`   Metafields:`);
        for (const { node: mf } of metafields) {
          console.log(`     - ${mf.namespace}.${mf.key}`);
        }
      }
      console.log("");
    }
  } catch (err) {
    console.error("Failed to fetch collections:", err);
  }

  // 4. Pages
  console.log("\n" + "=".repeat(60));
  console.log("PAGES (Content)");
  console.log("=".repeat(60));

  try {
    const pagesData = await executeGraphQL<any>(PAGES_QUERY);
    const pages = pagesData?.pages?.edges || [];

    console.log(`Found ${pages.length} pages\n`);

    for (const { node } of pages) {
      console.log(`📄 ${node.title}`);
      console.log(`   Handle: ${node.handle}`);
      console.log(`   Summary: ${node.bodySummary?.substring(0, 150) || "(no summary)"}...`);
      console.log(`   Body length: ${node.body?.length || 0} chars`);
      console.log("");
    }
  } catch (err) {
    console.error("Failed to fetch pages:", err);
  }

  // 5. Blogs
  console.log("\n" + "=".repeat(60));
  console.log("BLOGS & ARTICLES");
  console.log("=".repeat(60));

  try {
    const blogsData = await executeGraphQL<any>(BLOGS_QUERY);
    const blogs = blogsData?.blogs?.edges || [];

    console.log(`Found ${blogs.length} blogs\n`);

    for (const { node: blog } of blogs) {
      const articles = blog.articles?.edges || [];
      console.log(`📰 Blog: ${blog.title} (${articles.length} articles)`);

      for (const { node: article } of articles.slice(0, 5)) {
        console.log(`   - ${article.title}`);
        console.log(`     Tags: ${article.tags?.join(", ") || "(none)"}`);
      }
      if (articles.length > 5) {
        console.log(`   ... and ${articles.length - 5} more articles`);
      }
      console.log("");
    }
  } catch (err) {
    console.error("Failed to fetch blogs:", err);
  }

  console.log("\n" + "=".repeat(60));
  console.log("READOUT COMPLETE");
  console.log("=".repeat(60));
}

main().catch(console.error);
