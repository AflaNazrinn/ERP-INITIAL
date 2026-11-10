<?php
declare(strict_types=1);

require_once __DIR__ . '/master_validation.php';

/* Categories and their sub-categories (one to many). */

const CATEGORY_STATUSES = ['active', 'inactive'];

function category_format(array $row): array
{
    return [
        'id'            => (int) $row['id'],
        'code'          => $row['category_code'],
        'name'          => $row['category_name'],
        'status'        => $row['status'],
        'subCategories' => $row['sub_names'] ?? '',     // "A, B, C" for the list page
        'createdAt'     => date_only($row['created_at']),
    ];
}

function sub_category_format(array $row): array
{
    return [
        'id'           => (int) $row['id'],
        'name'         => $row['sub_category_name'],
        'categoryId'   => (int) $row['category_id'],
        'categoryName' => $row['category_name'],
        'sortOrder'    => (int) $row['sort_order'],
    ];
}

const CATEGORY_SELECT = "SELECT c.*, (SELECT GROUP_CONCAT(s.sub_category_name ORDER BY s.sort_order, s.sub_category_name SEPARATOR ', ')
    FROM sub_categories s WHERE s.category_id = c.id) AS sub_names FROM categories c";

/* Active categories for the lookups; every category when $all (the Category list page). */
function categories_list(string $search = '', bool $all = false): array
{
    $sql = CATEGORY_SELECT . ($all ? ' WHERE 1 = 1' : " WHERE c.status = 'active'");
    $params = [];
    if ($search !== '') {
        $sql .= ' AND (c.category_code LIKE ? OR c.category_name LIKE ?)';
        $params = [like($search), like($search)];
    }
    return array_map('category_format', query($sql . ' ORDER BY c.id DESC', $params)->fetchAll());
}

function category_find(int $id): array
{
    $row = query(CATEGORY_SELECT . ' WHERE c.id = ?', [$id])->fetch();
    if (!$row) {
        throw new NotFound('Category not found.');
    }
    $subs = query(
        'SELECT s.*, c.category_name FROM sub_categories s JOIN categories c ON c.id = s.category_id WHERE s.category_id = ? ORDER BY s.sort_order, s.sub_category_name',
        [$id]
    )->fetchAll();
    return category_format($row) + ['subcategories' => array_map('sub_category_format', $subs)];
}

/* Sub-categories of active categories; only one category's when $categoryId is given. */
function sub_categories_list(?int $categoryId = null, string $search = ''): array
{
    $sql = "SELECT s.*, c.category_name FROM sub_categories s JOIN categories c ON c.id = s.category_id WHERE c.status = 'active'";
    $params = [];
    if ($categoryId !== null) {
        $sql .= ' AND s.category_id = ?';
        $params[] = $categoryId;
    }
    if ($search !== '') {
        $sql .= ' AND s.sub_category_name LIKE ?';
        $params[] = like($search);
    }
    return array_map('sub_category_format', query($sql . ' ORDER BY s.id DESC', $params)->fetchAll());
}

function category_next_code(): string
{
    return next_code('categories', 'category_code', 'CAT');
}

function category_input(array $category): array
{
    return ['categoryName' => $category['name'], 'status' => $category['status'], 'subcategories' => array_column($category['subcategories'], 'name')];
}

/*
 * Payload: categoryName, status, subcategories: ["name", …] (may be empty).
 * On an update the list replaces the sub-categories: kept names keep their id (items point at it),
 * new names are added, and removed ones are deleted unless an item still uses them.
 */
function category_save(array $data, ?int $id = null): array
{
    if ($id !== null) {
        $data = array_replace(category_input(category_find($id)), $data);
    }
    $in = new Input($data);
    $name = $in->name('categoryName', 'Category name', 100);
    $status = $in->choice('status', 'Record status', CATEGORY_STATUSES, 'active');
    $subcategories = [];
    foreach ((array) ($data['subcategories'] ?? []) as $sub) {
        $sub = mb_strtoupper(trim(is_scalar($sub) ? (string) $sub : ''));
        if ($sub === '') {
            continue;
        }
        if (mb_strlen($sub) > 100) {
            $in->fail('subcategories', 'Subcategory names must be at most 100 characters.');
        }
        $subcategories[$sub] = $sub;   // the same name twice is kept once
    }
    if ($name !== '' && query('SELECT 1 FROM categories WHERE category_name = ? AND id <> ?', [$name, $id ?? 0])->fetchColumn()) {
        $in->fail('categoryName', 'A category with this name already exists.');
    }
    $existing = [];   // UPPER NAME => id
    if ($id !== null) {
        foreach (query('SELECT id, sub_category_name FROM sub_categories WHERE category_id = ?', [$id])->fetchAll() as $row) {
            $existing[mb_strtoupper($row['sub_category_name'])] = (int) $row['id'];
        }
        foreach (array_diff_key($existing, $subcategories) as $removed => $subId) {
            if (query('SELECT 1 FROM items WHERE sub_category_id = ? LIMIT 1', [$subId])->fetchColumn()) {
                $in->fail('subcategories', "$removed is used by items, so it cannot be removed.");
            }
        }
    }
    $in->done();

    $id = transaction(static function () use ($id, $name, $status, $subcategories, $existing): int {
        if ($id === null) {
            query('INSERT INTO categories (category_code, category_name, status) VALUES (?, ?, ?)', [category_next_code(), $name, $status]);
            $id = (int) db()->lastInsertId();
        } else {
            query('UPDATE categories SET category_name = ?, status = ? WHERE id = ?', [$name, $status, $id]);
            query('UPDATE items SET category = ? WHERE category_id = ?', [mb_substr($name, 0, 100), $id]);
            foreach (array_diff_key($existing, $subcategories) as $subId) {
                query('DELETE FROM sub_categories WHERE id = ?', [$subId]);
            }
        }
        $order = 0;
        foreach ($subcategories as $sub) {
            $order++;
            if (isset($existing[$sub])) {
                query('UPDATE sub_categories SET sub_category_name = ?, sort_order = ? WHERE id = ?', [$sub, $order, $existing[$sub]]);
            } else {
                query('INSERT INTO sub_categories (category_id, sub_category_name, sort_order) VALUES (?, ?, ?)', [$id, $sub, $order]);
            }
        }
        return $id;
    });
    return category_find($id);
}

function category_create(array $data): array
{
    return category_save($data);
}

/* Its sub-categories go with it; 409 while items still use the category or one of them. */
function category_delete(int $id): void
{
    delete_row('categories', $id, 'Category not found.');
}
