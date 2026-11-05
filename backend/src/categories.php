<?php
declare(strict_types=1);

require_once __DIR__ . '/master_validation.php';

/* Categories and their sub-categories (one to many). */

const CATEGORY_STATUSES = ['active', 'inactive'];

function category_format(array $row): array
{
    return [
        'id'     => (int) $row['id'],
        'code'   => $row['category_code'],
        'name'   => $row['category_name'],
        'status' => $row['status'],
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

function categories_list(string $search = ''): array
{
    $sql = "SELECT * FROM categories WHERE status = 'active'";
    $params = [];
    if ($search !== '') {
        $sql .= ' AND (category_code LIKE ? OR category_name LIKE ?)';
        $params = [like($search), like($search)];
    }
    return array_map('category_format', query($sql . ' ORDER BY category_name', $params)->fetchAll());
}

function category_find(int $id): array
{
    $row = query('SELECT * FROM categories WHERE id = ?', [$id])->fetch();
    if (!$row) {
        throw new NotFound('Category not found.');
    }
    return category_format($row) + ['subcategories' => sub_categories_list($id)];
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
    return array_map('sub_category_format', query($sql . ' ORDER BY c.category_name, s.sort_order, s.sub_category_name', $params)->fetchAll());
}

function category_next_code(): string
{
    return next_code('categories', 'category_code', 'CAT');
}

/* Payload: categoryName, status, subcategories: ["name", …] (at least one). */
function category_create(array $data): array
{
    $in = new Input($data);
    $name = $in->text('categoryName', 'Category name', 100, true);
    $status = $in->choice('status', 'Record status', CATEGORY_STATUSES, 'active');
    $subcategories = [];
    foreach ((array) ($data['subcategories'] ?? []) as $sub) {
        $sub = trim(is_scalar($sub) ? (string) $sub : '');
        if ($sub === '') {
            continue;
        }
        if (mb_strlen($sub) > 100) {
            $in->fail('subcategories', 'Subcategory names must be at most 100 characters.');
        }
        $subcategories[mb_strtolower($sub)] = $sub;   // the same name twice is kept once
    }
    if (!$subcategories) {
        $in->fail('subcategories', 'Add at least one subcategory.');
    }
    if ($name !== '' && query('SELECT 1 FROM categories WHERE category_name = ?', [$name])->fetchColumn()) {
        $in->fail('categoryName', 'A category with this name already exists.');
    }
    $in->done();

    $id = transaction(static function () use ($name, $status, $subcategories): int {
        query('INSERT INTO categories (category_code, category_name, status) VALUES (?, ?, ?)', [category_next_code(), $name, $status]);
        $id = (int) db()->lastInsertId();
        $order = 0;
        foreach ($subcategories as $sub) {
            query('INSERT INTO sub_categories (category_id, sub_category_name, sort_order) VALUES (?, ?, ?)', [$id, $sub, ++$order]);
        }
        return $id;
    });
    return category_find($id);
}
