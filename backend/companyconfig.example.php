<?php
/*
 * TEMPLATE: the program writes companyconfig.php from this layout by itself (from an older .env when there is
 * one). To set it up by hand, copy this file to companyconfig.php next to config.php and fill in server.
 *
 * Growth Engine: the companies on this server and where each one's data is kept.
 *
 * Every company has its own MySQL database. A user of company A signs in to company A's database
 * only; nothing in the program lets that session read or reach company B's database or files.
 *
 * The program writes this file: you fill in 'server' once, and the Create a Company
 * page creates each company's database and adds it under 'companies'. Never type a company in by hand.
 *
 * Keep it private: it holds database passwords. It sits outside public_html, .gitignore keeps it out of
 * git and the Hostinger build never packs it. Back it up with the databases: without it nobody can sign in.
 */

return [
    // The MySQL login that creates each new company's database (it needs the CREATE privilege).
    // prefix: put in front of every new database name. Hostinger: your account prefix, e.g. 'u123456789_'.
    'server' => [
        'host' => 'localhost',
        'port' => 3306,
        'user' => '',
        'pass' => '',
        'prefix' => '',
    ],

    // Only when the server login may not create databases (Hostinger shared hosting): empty databases you
    // made in hPanel > Databases, one for each company still to come. Each new company takes the first one
    // and it is removed from this list. 'user' and 'pass' may be left out when the server login may open it.
    //   ['name' => 'u123456789_company2', 'user' => 'u123456789_company2', 'pass' => 'its password'],
    'spare_databases' => [],

    // The Create a Company page. enabled: false turns it off. key: when not empty, the page asks for this
    // access key, so only people you give it to can create companies.
    'creation' => [
        'enabled' => true,
        'key' => '',
    ],

    // Written by the program: one entry per company, by company code.
    'companies' => [],
];
