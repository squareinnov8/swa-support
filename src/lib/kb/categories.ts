/**
 * KB Categories Module
 *
 * CRUD operations for the hierarchical category system.
 * Categories use an adjacency list pattern (parent_id) for hierarchy.
 */

import { supabase } from "@/lib/db";
import type {
  KBCategory,
  KBCategoryWithPath,
  CreateKBCategoryInput,
  INITIAL_CATEGORIES,
} from "./types";

/**
 * Get all categories as a flat list
 */
export async function getAllCategories(): Promise<KBCategory[]> {
  const { data, error } = await supabase
    .from("kb_categories")
    .select("*")
    .order("sort_order", { ascending: true });

  if (error) {
    throw new Error(`Failed to fetch categories: ${error.message}`);
  }

  return data ?? [];
}

/**
 * Get a single category by ID
 */
export async function getCategoryById(id: string): Promise<KBCategory | null> {
  const { data, error } = await supabase
    .from("kb_categories")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to fetch category: ${error.message}`);
  }

  return data;
}

/**
 * Get a category by slug
 */
export async function getCategoryBySlug(slug: string): Promise<KBCategory | null> {
  const { data, error } = await supabase
    .from("kb_categories")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to fetch category: ${error.message}`);
  }

  return data;
}

/**
 * Get child categories for a parent
 */
export async function getChildCategories(parentId: string | null): Promise<KBCategory[]> {
  const query = supabase
    .from("kb_categories")
    .select("*")
    .order("sort_order", { ascending: true });

  if (parentId === null) {
    const { data, error } = await query.is("parent_id", null);
    if (error) throw new Error(`Failed to fetch categories: ${error.message}`);
    return data ?? [];
  }

  const { data, error } = await query.eq("parent_id", parentId);
  if (error) throw new Error(`Failed to fetch categories: ${error.message}`);
  return data ?? [];
}

/**
 * Get top-level categories (no parent)
 */
export async function getTopLevelCategories(): Promise<KBCategory[]> {
  return getChildCategories(null);
}

/**
 * Build the full path for a category (ancestors)
 */
export async function getCategoryPath(categoryId: string): Promise<string[]> {
  const allCategories = await getAllCategories();
  const categoryMap = new Map(allCategories.map((c) => [c.id, c]));

  const path: string[] = [];
  let current = categoryMap.get(categoryId);

  while (current) {
    path.unshift(current.name);
    current = current.parent_id ? categoryMap.get(current.parent_id) : undefined;
  }

  return path;
}

/**
 * Get all categories with their paths computed
 */
export async function getCategoriesWithPaths(): Promise<KBCategoryWithPath[]> {
  const allCategories = await getAllCategories();
  const categoryMap = new Map(allCategories.map((c) => [c.id, c]));

  return allCategories.map((category) => {
    const path: string[] = [];
    let current: KBCategory | undefined = category;
    let depth = 0;

    while (current) {
      path.unshift(current.name);
      current = current.parent_id ? categoryMap.get(current.parent_id) : undefined;
      if (current) depth++;
    }

    return {
      ...category,
      path,
      depth,
    };
  });
}

/**
 * Get category tree structure
 */
export type CategoryTreeNode = KBCategory & {
  children: CategoryTreeNode[];
};

export async function getCategoryTree(): Promise<CategoryTreeNode[]> {
  const allCategories = await getAllCategories();

  // Build map of children for each parent
  const childrenMap = new Map<string | null, KBCategory[]>();
  for (const category of allCategories) {
    const parentKey = category.parent_id ?? "root";
    const existing = childrenMap.get(parentKey) ?? [];
    existing.push(category);
    childrenMap.set(parentKey, existing);
  }

  // Recursively build tree
  function buildTree(parentId: string | null): CategoryTreeNode[] {
    const key = parentId ?? "root";
    const children = childrenMap.get(key) ?? [];
    return children.map((category) => ({
      ...category,
      children: buildTree(category.id),
    }));
  }

  return buildTree(null);
}

/**
 * Create a new category
 */
export async function createCategory(input: CreateKBCategoryInput): Promise<KBCategory> {
  const { data, error } = await supabase
    .from("kb_categories")
    .insert({
      name: input.name,
      slug: input.slug,
      parent_id: input.parent_id ?? null,
      description: input.description ?? null,
      sort_order: input.sort_order ?? 0,
    })
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to create category: ${error.message}`);
  }

  return data;
}

/**
 * Update a category
 */
export async function updateCategory(
  id: string,
  updates: Partial<CreateKBCategoryInput>
): Promise<KBCategory> {
  const { data, error } = await supabase
    .from("kb_categories")
    .update({
      ...(updates.name !== undefined && { name: updates.name }),
      ...(updates.slug !== undefined && { slug: updates.slug }),
      ...(updates.parent_id !== undefined && { parent_id: updates.parent_id }),
      ...(updates.description !== undefined && { description: updates.description }),
      ...(updates.sort_order !== undefined && { sort_order: updates.sort_order }),
    })
    .eq("id", id)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to update category: ${error.message}`);
  }

  return data;
}

/**
 * Delete a category (and children via CASCADE)
 */
export async function deleteCategory(id: string): Promise<void> {
  const { error } = await supabase.from("kb_categories").delete().eq("id", id);

  if (error) {
    throw new Error(`Failed to delete category: ${error.message}`);
  }
}

/**
 * Move a category to a new parent
 */
export async function moveCategory(id: string, newParentId: string | null): Promise<KBCategory> {
  return updateCategory(id, { parent_id: newParentId ?? undefined });
}

/**
 * Seed initial categories from INITIAL_CATEGORIES constant
 */
export async function seedInitialCategories(
  categories: typeof INITIAL_CATEGORIES
): Promise<KBCategory[]> {
  const created: KBCategory[] = [];

  for (const input of categories) {
    // Check if already exists
    const existing = await getCategoryBySlug(input.slug);
    if (existing) {
      created.push(existing);
      continue;
    }

    const category = await createCategory(input);
    created.push(category);
  }

  return created;
}

/**
 * Get count of documents in a category
 */
export async function getCategoryDocCount(categoryId: string): Promise<number> {
  const { count, error } = await supabase
    .from("kb_docs")
    .select("*", { count: "exact", head: true })
    .eq("category_id", categoryId);

  if (error) {
    throw new Error(`Failed to count docs: ${error.message}`);
  }

  return count ?? 0;
}

/**
 * Get categories with document counts
 */
export async function getCategoriesWithDocCounts(): Promise<
  (KBCategoryWithPath & { doc_count: number })[]
> {
  const categoriesWithPaths = await getCategoriesWithPaths();

  // Get doc counts for all categories
  const counts = await Promise.all(
    categoriesWithPaths.map(async (cat) => ({
      id: cat.id,
      count: await getCategoryDocCount(cat.id),
    }))
  );

  const countMap = new Map(counts.map((c) => [c.id, c.count]));

  return categoriesWithPaths.map((cat) => ({
    ...cat,
    doc_count: countMap.get(cat.id) ?? 0,
  }));
}
