<?php
declare(strict_types=1);

/*
 * The signed-in company's base currency (picked on Create a Company, company_profile.base_currency): prices, costs
 * and totals are kept in it, and a document or party with no currency of its own takes it. OMR when not set.
 */
function company_base_currency(): string
{
    static $base = null;
    if ($base === null) {
        try {
            $base = strtoupper(trim((string) query('SELECT base_currency FROM company_profile WHERE id = 1')->fetchColumn()));
        } catch (Throwable) {
            $base = '';
        }
        $base = preg_match('/^[A-Z]{3}$/', $base) ? $base : 'OMR';
    }
    return $base;
}

/* The company's VAT (Create a Company): whether it charges VAT and at what %. */
function company_vat(): array
{
    static $vat = null;
    if ($vat === null) {
        try {
            $row = query('SELECT vat_applicable, vat_percentage FROM company_profile WHERE id = 1')->fetch() ?: [];
        } catch (Throwable) {
            $row = [];
        }
        $vat = ['applicable' => !$row || (int) $row['vat_applicable'] === 1,
            'percentage' => $row && $row['vat_percentage'] !== null ? (float) $row['vat_percentage'] : 5.0];
    }
    return $vat;
}
