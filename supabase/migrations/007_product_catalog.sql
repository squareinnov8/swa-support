-- Product Catalog Tables
-- Synced from Shopify for vehicle-specific product lookups

-- Products table (synced from Shopify)
create table if not exists products (
  id uuid primary key default gen_random_uuid(),
  shopify_id text unique not null,          -- gid://shopify/Product/...
  handle text not null,                      -- URL slug
  title text not null,
  description text,
  product_type text,                         -- "Head Units", "Accessories"
  vendor text,
  status text default 'ACTIVE',              -- ACTIVE/ARCHIVED/DRAFT
  tags text[],                               -- Raw tags from Shopify
  price_min numeric(10,2),
  price_max numeric(10,2),
  image_url text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  synced_at timestamptz default now()
);

-- Product variants
create table if not exists product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references products(id) on delete cascade,
  shopify_id text unique not null,          -- gid://shopify/ProductVariant/...
  sku text,
  title text not null,
  price numeric(10,2) not null,
  compare_at_price numeric(10,2),
  inventory_quantity int default 0,
  created_at timestamptz default now()
);

-- Parsed fitment data from tags
create table if not exists product_fitment (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references products(id) on delete cascade,
  year_start int,
  year_end int,
  make text not null,                        -- "Infiniti", "Nissan"
  model text,                                -- "Q50", "Titan"
  trim text,                                 -- "RedSport" (if available)
  notes text,
  created_at timestamptz default now(),

  -- Index for efficient lookups
  unique(product_id, make, model, year_start, year_end)
);

-- Product relationships (e.g., "requires harness X")
create table if not exists product_relations (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references products(id) on delete cascade,
  related_product_id uuid references products(id) on delete cascade,
  relation_type text not null,               -- 'requires', 'works_with', 'replaces', 'accessory'
  notes text,
  created_at timestamptz default now(),

  unique(product_id, related_product_id, relation_type)
);

-- Indexes for common queries
create index if not exists idx_products_status on products(status);
create index if not exists idx_products_handle on products(handle);
create index if not exists idx_products_product_type on products(product_type);

create index if not exists idx_product_fitment_make on product_fitment(make);
create index if not exists idx_product_fitment_model on product_fitment(model);
create index if not exists idx_product_fitment_year on product_fitment(year_start, year_end);
create index if not exists idx_product_fitment_lookup on product_fitment(make, model, year_start, year_end);

create index if not exists idx_product_variants_sku on product_variants(sku);

-- Function to find products by vehicle
create or replace function find_products_by_vehicle(
  p_year int,
  p_make text,
  p_model text default null
)
returns table (
  product_id uuid,
  shopify_id text,
  handle text,
  title text,
  description text,
  product_type text,
  price_min numeric,
  price_max numeric,
  image_url text,
  fitment_make text,
  fitment_model text,
  fitment_years text
)
language sql
stable
as $$
  select distinct
    p.id as product_id,
    p.shopify_id,
    p.handle,
    p.title,
    p.description,
    p.product_type,
    p.price_min,
    p.price_max,
    p.image_url,
    pf.make as fitment_make,
    pf.model as fitment_model,
    case
      when pf.year_start = pf.year_end then pf.year_start::text
      else pf.year_start::text || '-' || pf.year_end::text
    end as fitment_years
  from products p
  join product_fitment pf on pf.product_id = p.id
  where p.status = 'ACTIVE'
    and lower(pf.make) = lower(p_make)
    and (p_model is null or lower(pf.model) = lower(p_model))
    and p_year between pf.year_start and pf.year_end
  order by p.title;
$$;
