using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Finora.Erp.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class InitialErp : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.EnsureSchema(
                name: "erp");

            migrationBuilder.CreateTable(
                name: "charge_categories",
                schema: "erp",
                columns: table => new
                {
                    id = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    name = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    code = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    direction = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    scope = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    description = table.Column<string>(type: "character varying(400)", maxLength: 400, nullable: true),
                    active = table.Column<bool>(type: "boolean", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_charge_categories", x => x.id);
                    table.CheckConstraint("ck_charge_categories_direction", "\"direction\" IN ('EXPENSE', 'REVENUE')");
                    table.CheckConstraint("ck_charge_categories_scope", "\"scope\" IN ('INVOICE', 'GENERAL')");
                });

            migrationBuilder.CreateTable(
                name: "containers",
                schema: "erp",
                columns: table => new
                {
                    id = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    reference = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    load_date = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    arrival_date = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    gross_weight_kg = table.Column<decimal>(type: "numeric(18,3)", precision: 18, scale: 3, nullable: true),
                    net_weight_kg = table.Column<decimal>(type: "numeric(18,3)", precision: 18, scale: 3, nullable: true),
                    bl_number = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: true),
                    booking_number = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: true),
                    seal_number = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_containers", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "cost_centres",
                schema: "erp",
                columns: table => new
                {
                    id = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    name = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    code = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    description = table.Column<string>(type: "character varying(400)", maxLength: 400, nullable: true),
                    active = table.Column<bool>(type: "boolean", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_cost_centres", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "customers",
                schema: "erp",
                columns: table => new
                {
                    id = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    name = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    code = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    default_currency = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    contact_name = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    email = table.Column<string>(type: "character varying(320)", maxLength: 320, nullable: true),
                    phone = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: true),
                    country = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    payment_terms_days = table.Column<int>(type: "integer", nullable: false),
                    credit_limit = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: false),
                    customer_type = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    active = table.Column<bool>(type: "boolean", nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    portal_account = table.Column<bool>(type: "boolean", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_customers", x => x.id);
                    table.CheckConstraint("ck_customers_customer_type", "\"customer_type\" IN ('BUYER', 'SUPPLIER', 'BOTH', 'EMPLOYEE', 'OTHER')");
                    table.CheckConstraint("ck_customers_default_currency", "\"default_currency\" IN ('USD', 'AED', 'IQD')");
                });

            migrationBuilder.CreateTable(
                name: "exchange_gain_losses",
                schema: "erp",
                columns: table => new
                {
                    id = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    number = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    date = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    type = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    amount = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: false),
                    notes = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: true),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_exchange_gain_losses", x => x.id);
                    table.CheckConstraint("ck_exchange_gain_losses_type", "\"type\" IN ('GAIN', 'LOSS')");
                    table.CheckConstraint("ck_exchange_gain_losses_type_matches_sign", "(type = 'GAIN' AND amount >= 0) OR (type = 'LOSS' AND amount <= 0)");
                });

            migrationBuilder.CreateTable(
                name: "financial_accounts",
                schema: "erp",
                columns: table => new
                {
                    id = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    name = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    type = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    currency = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    active = table.Column<bool>(type: "boolean", nullable: false),
                    description = table.Column<string>(type: "character varying(400)", maxLength: 400, nullable: true),
                    account_number = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: true),
                    iban = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: true),
                    swift_code = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: true),
                    address = table.Column<string>(type: "character varying(400)", maxLength: 400, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_financial_accounts", x => x.id);
                    table.CheckConstraint("ck_financial_accounts_bank_fields", "type <> 'BANK' OR (account_number IS NOT NULL AND iban IS NOT NULL)");
                    table.CheckConstraint("ck_financial_accounts_currency", "\"currency\" IN ('USD', 'AED', 'IQD')");
                    table.CheckConstraint("ck_financial_accounts_type", "\"type\" IN ('BANK', 'CASH_SAFE')");
                });

            migrationBuilder.CreateTable(
                name: "goods",
                schema: "erp",
                columns: table => new
                {
                    id = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    name = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    code = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    metal_type = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    form = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: true),
                    unit = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    hs_code = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: true),
                    description = table.Column<string>(type: "character varying(400)", maxLength: 400, nullable: true),
                    active = table.Column<bool>(type: "boolean", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_goods", x => x.id);
                    table.CheckConstraint("ck_goods_form", "form IS NULL OR \"form\" IN ('CATHODE', 'INGOT', 'BILLET', 'SCRAP', 'WIRE_ROD', 'GRANULES', 'POWDER', 'OTHER')");
                    table.CheckConstraint("ck_goods_metal_type", "\"metal_type\" IN ('COPPER', 'ALUMINIUM', 'ZINC', 'LEAD', 'NICKEL', 'TIN', 'BRASS', 'STEEL', 'OTHER')");
                    table.CheckConstraint("ck_goods_unit", "\"unit\" IN ('MT')");
                });

            migrationBuilder.CreateTable(
                name: "partners",
                schema: "erp",
                columns: table => new
                {
                    id = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    name = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    code = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    active = table.Column<bool>(type: "boolean", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_partners", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "settings",
                schema: "erp",
                columns: table => new
                {
                    key = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    value = table.Column<string>(type: "character varying(400)", maxLength: 400, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_settings", x => x.key);
                });

            migrationBuilder.CreateTable(
                name: "warehouses",
                schema: "erp",
                columns: table => new
                {
                    id = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    name = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    code = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    location = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    active = table.Column<bool>(type: "boolean", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_warehouses", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "contracts",
                schema: "erp",
                columns: table => new
                {
                    id = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    customer_id = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    contract_type = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    date = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    destination = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    status = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    notes = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_contracts", x => x.id);
                    table.CheckConstraint("ck_contracts_contract_type", "\"contract_type\" IN ('SELL', 'PURCHASE')");
                    table.CheckConstraint("ck_contracts_status", "\"status\" IN ('ACTIVE', 'CLOSED', 'ON HOLD', 'CANCELLED')");
                    table.ForeignKey(
                        name: "fk_contracts_customers_customer_id",
                        column: x => x.customer_id,
                        principalSchema: "erp",
                        principalTable: "customers",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "payments",
                schema: "erp",
                columns: table => new
                {
                    id = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    customer_id = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    date = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    currency = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    amount = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: false),
                    fx_rate = table.Column<decimal>(type: "numeric(18,6)", precision: 18, scale: 6, nullable: false),
                    amount_usd = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: false),
                    method = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    reference = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    notes = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: true),
                    invoice_id = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: true),
                    direction = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    type = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    status = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_payments", x => x.id);
                    table.CheckConstraint("ck_payments_currency", "\"currency\" IN ('USD', 'AED', 'IQD')");
                    table.CheckConstraint("ck_payments_direction", "\"direction\" IN ('IN', 'OUT')");
                    table.CheckConstraint("ck_payments_fx_rate", "fx_rate > 0");
                    table.CheckConstraint("ck_payments_method", "\"method\" IN ('TT', 'Cash', 'Cheque', 'Offset', 'Credit Note')");
                    table.CheckConstraint("ck_payments_status", "\"status\" IN ('DRAFT', 'CONFIRMED')");
                    table.CheckConstraint("ck_payments_type", "\"type\" IN ('INVOICE', 'GENERAL')");
                    table.ForeignKey(
                        name: "fk_payments_customers_customer_id",
                        column: x => x.customer_id,
                        principalSchema: "erp",
                        principalTable: "customers",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "cheques",
                schema: "erp",
                columns: table => new
                {
                    id = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    type = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    number = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    bank_name = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    due_date = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    amount = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: false),
                    currency = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    owner_name = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    bank_account_id = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: true),
                    status = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    notes = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_cheques", x => x.id);
                    table.CheckConstraint("ck_cheques_currency", "\"currency\" IN ('USD', 'AED', 'IQD')");
                    table.CheckConstraint("ck_cheques_paid_has_account", "(status = 'PAID' AND bank_account_id IS NOT NULL) OR (status <> 'PAID' AND bank_account_id IS NULL)");
                    table.CheckConstraint("ck_cheques_status", "\"status\" IN ('PENDING', 'PAID', 'EXPIRED', 'RETURNED', 'CHANGED')");
                    table.CheckConstraint("ck_cheques_type", "\"type\" IN ('NORMAL', 'SECURITY')");
                    table.ForeignKey(
                        name: "fk_cheques_financial_accounts_bank_account_id",
                        column: x => x.bank_account_id,
                        principalSchema: "erp",
                        principalTable: "financial_accounts",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "money_transfers",
                schema: "erp",
                columns: table => new
                {
                    id = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    number = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    date = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    from_account_id = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    to_account_id = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    from_currency = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    to_currency = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    from_amount = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: false),
                    to_amount = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: false),
                    exchange_rate = table.Column<decimal>(type: "numeric(18,6)", precision: 18, scale: 6, nullable: false),
                    base_amount = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: false),
                    status = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    notes = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_money_transfers", x => x.id);
                    table.CheckConstraint("ck_money_transfers_distinct_accounts", "from_account_id <> to_account_id");
                    table.CheckConstraint("ck_money_transfers_exchange_rate", "exchange_rate > 0");
                    table.CheckConstraint("ck_money_transfers_from_currency", "\"from_currency\" IN ('USD', 'AED', 'IQD')");
                    table.CheckConstraint("ck_money_transfers_same_currency_rate", "from_currency <> to_currency OR exchange_rate = 1");
                    table.CheckConstraint("ck_money_transfers_status", "\"status\" IN ('DRAFT', 'CONFIRMED', 'CANCELLED')");
                    table.CheckConstraint("ck_money_transfers_to_currency", "\"to_currency\" IN ('USD', 'AED', 'IQD')");
                    table.ForeignKey(
                        name: "fk_money_transfers_financial_accounts_from_account_id",
                        column: x => x.from_account_id,
                        principalSchema: "erp",
                        principalTable: "financial_accounts",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_money_transfers_financial_accounts_to_account_id",
                        column: x => x.to_account_id,
                        principalSchema: "erp",
                        principalTable: "financial_accounts",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "contract_items",
                schema: "erp",
                columns: table => new
                {
                    id = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    contract_id = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    product = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    quantity_mt = table.Column<decimal>(type: "numeric(18,3)", precision: 18, scale: 3, nullable: false),
                    lme_percent = table.Column<decimal>(type: "numeric(9,4)", precision: 9, scale: 4, nullable: false),
                    lme_fixed = table.Column<bool>(type: "boolean", nullable: false),
                    fixed_lme_price = table.Column<decimal>(type: "numeric(18,4)", precision: 18, scale: 4, nullable: false),
                    premium = table.Column<decimal>(type: "numeric(18,4)", precision: 18, scale: 4, nullable: false),
                    incoterm = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    status = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    notes = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: true),
                    remaining_mt = table.Column<decimal>(type: "numeric(18,3)", precision: 18, scale: 3, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_contract_items", x => x.id);
                    table.CheckConstraint("ck_contract_items_incoterm", "\"incoterm\" IN ('FOB', 'CIF', 'CFR', 'CNF', 'EXW', 'DAP')");
                    table.CheckConstraint("ck_contract_items_status", "\"status\" IN ('ACTIVE', 'CLOSED', 'ON HOLD', 'CANCELLED')");
                    table.ForeignKey(
                        name: "fk_contract_items_contracts_contract_id",
                        column: x => x.contract_id,
                        principalSchema: "erp",
                        principalTable: "contracts",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "invoices",
                schema: "erp",
                columns: table => new
                {
                    id = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    invoice_number = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    invoice_type = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    invoice_date = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    contract_id = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    customer_id = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    status = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    currency = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    exchange_rate = table.Column<decimal>(type: "numeric(18,6)", precision: 18, scale: 6, nullable: false),
                    description = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: true),
                    ref_invoice_id = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: true),
                    sent_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    total_amount = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: false),
                    total_discount = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: false),
                    total_weight_mt = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_invoices", x => x.id);
                    table.CheckConstraint("ck_invoices_currency", "\"currency\" IN ('USD', 'AED', 'IQD')");
                    table.CheckConstraint("ck_invoices_invoice_type", "\"invoice_type\" IN ('PURCHASE_ORDER', 'PURCHASE_PROVISIONAL', 'PURCHASE_INVOICE', 'SALE_ORDER', 'SALE_PROVISIONAL', 'SALE_INVOICE')");
                    table.CheckConstraint("ck_invoices_status", "\"status\" IN ('DRAFT', 'CONFIRMED', 'CANCELLED')");
                    table.ForeignKey(
                        name: "fk_invoices_contracts_contract_id",
                        column: x => x.contract_id,
                        principalSchema: "erp",
                        principalTable: "contracts",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_invoices_customers_customer_id",
                        column: x => x.customer_id,
                        principalSchema: "erp",
                        principalTable: "customers",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_invoices_invoices_ref_invoice_id",
                        column: x => x.ref_invoice_id,
                        principalSchema: "erp",
                        principalTable: "invoices",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "money_transfer_allocations",
                schema: "erp",
                columns: table => new
                {
                    id = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    transfer_id = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    invoice_id = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: true),
                    invoice_item_id = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: true),
                    amount = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: false),
                    currency = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    base_amount = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: false),
                    base_currency = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_money_transfer_allocations", x => x.id);
                    table.CheckConstraint("ck_money_transfer_allocations_base_currency", "\"base_currency\" IN ('USD', 'AED', 'IQD')");
                    table.CheckConstraint("ck_money_transfer_allocations_currency", "\"currency\" IN ('USD', 'AED', 'IQD')");
                    table.ForeignKey(
                        name: "fk_money_transfer_allocations_money_transfers_transfer_id",
                        column: x => x.transfer_id,
                        principalSchema: "erp",
                        principalTable: "money_transfers",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "container_goods",
                schema: "erp",
                columns: table => new
                {
                    container_id = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    contract_item_id = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    quantity_mt = table.Column<decimal>(type: "numeric(18,3)", precision: 18, scale: 3, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_container_goods", x => new { x.container_id, x.contract_item_id });
                    table.ForeignKey(
                        name: "fk_container_goods_containers_container_id",
                        column: x => x.container_id,
                        principalSchema: "erp",
                        principalTable: "containers",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "fk_container_goods_contract_items_contract_item_id",
                        column: x => x.contract_item_id,
                        principalSchema: "erp",
                        principalTable: "contract_items",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "item_partners",
                schema: "erp",
                columns: table => new
                {
                    contract_item_id = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    partner_id = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    percent = table.Column<decimal>(type: "numeric(9,4)", precision: 9, scale: 4, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_item_partners", x => new { x.contract_item_id, x.partner_id });
                    table.CheckConstraint("ck_item_partners_percent", "percent > 0 AND percent <= 100");
                    table.ForeignKey(
                        name: "fk_item_partners_contract_items_contract_item_id",
                        column: x => x.contract_item_id,
                        principalSchema: "erp",
                        principalTable: "contract_items",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "fk_item_partners_partners_partner_id",
                        column: x => x.partner_id,
                        principalSchema: "erp",
                        principalTable: "partners",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "charge_docs",
                schema: "erp",
                columns: table => new
                {
                    id = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    direction = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    kind = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    title = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    invoice_id = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: true),
                    date = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    description = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: true),
                    status = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    total_usd = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_charge_docs", x => x.id);
                    table.CheckConstraint("ck_charge_docs_direction", "\"direction\" IN ('EXPENSE', 'REVENUE')");
                    table.CheckConstraint("ck_charge_docs_kind", "\"kind\" IN ('INVOICE', 'GENERAL')");
                    table.CheckConstraint("ck_charge_docs_kind_invoice", "(kind = 'INVOICE' AND invoice_id IS NOT NULL) OR (kind = 'GENERAL' AND invoice_id IS NULL)");
                    table.CheckConstraint("ck_charge_docs_status", "\"status\" IN ('ACTIVE', 'CANCELLED')");
                    table.ForeignKey(
                        name: "fk_charge_docs_invoices_invoice_id",
                        column: x => x.invoice_id,
                        principalSchema: "erp",
                        principalTable: "invoices",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "claims",
                schema: "erp",
                columns: table => new
                {
                    id = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    side = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    title = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    invoice_id = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    party_id = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    claim_type = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    date = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    currency = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    fx_rate = table.Column<decimal>(type: "numeric(18,6)", precision: 18, scale: 6, nullable: false),
                    amount = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: false),
                    amount_usd = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: false),
                    description = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: true),
                    status = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_claims", x => x.id);
                    table.CheckConstraint("ck_claims_claim_type", "\"claim_type\" IN ('QUANTITY', 'QUALITY')");
                    table.CheckConstraint("ck_claims_currency", "\"currency\" IN ('USD', 'AED', 'IQD')");
                    table.CheckConstraint("ck_claims_fx_rate", "fx_rate > 0");
                    table.CheckConstraint("ck_claims_side", "\"side\" IN ('SALE', 'PURCHASE')");
                    table.CheckConstraint("ck_claims_status", "\"status\" IN ('ACTIVE', 'CANCELLED')");
                    table.ForeignKey(
                        name: "fk_claims_customers_party_id",
                        column: x => x.party_id,
                        principalSchema: "erp",
                        principalTable: "customers",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_claims_invoices_invoice_id",
                        column: x => x.invoice_id,
                        principalSchema: "erp",
                        principalTable: "invoices",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "inventory_documents",
                schema: "erp",
                columns: table => new
                {
                    id = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    doc_number = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    warehouse_id = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    invoice_id = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: true),
                    type = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    date = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    status = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    notes = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_inventory_documents", x => x.id);
                    table.CheckConstraint("ck_inventory_documents_status", "\"status\" IN ('CONFIRMED', 'CANCELLED')");
                    table.CheckConstraint("ck_inventory_documents_type", "\"type\" IN ('IN', 'OUT')");
                    table.ForeignKey(
                        name: "fk_inventory_documents_invoices_invoice_id",
                        column: x => x.invoice_id,
                        principalSchema: "erp",
                        principalTable: "invoices",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_inventory_documents_warehouses_warehouse_id",
                        column: x => x.warehouse_id,
                        principalSchema: "erp",
                        principalTable: "warehouses",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "invoice_items",
                schema: "erp",
                columns: table => new
                {
                    id = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    invoice_id = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    contract_item_id = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    reference_document_item_id = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    product = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    quantity_mt = table.Column<decimal>(type: "numeric(18,3)", precision: 18, scale: 3, nullable: false),
                    lme_percent = table.Column<decimal>(type: "numeric(9,4)", precision: 9, scale: 4, nullable: false),
                    lme_fixed = table.Column<bool>(type: "boolean", nullable: false),
                    fixed_price = table.Column<decimal>(type: "numeric(18,4)", precision: 18, scale: 4, nullable: false),
                    premium = table.Column<decimal>(type: "numeric(18,4)", precision: 18, scale: 4, nullable: false),
                    lme_price = table.Column<decimal>(type: "numeric(18,4)", precision: 18, scale: 4, nullable: true),
                    lme_date = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    discount_percent = table.Column<decimal>(type: "numeric(9,4)", precision: 9, scale: 4, nullable: true),
                    amount = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: false),
                    container_id = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: true),
                    description = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_invoice_items", x => x.id);
                    table.CheckConstraint("ck_invoice_items_discount_percent", "discount_percent IS NULL OR (discount_percent >= 0 AND discount_percent <= 100)");
                    table.ForeignKey(
                        name: "fk_invoice_items_containers_container_id",
                        column: x => x.container_id,
                        principalSchema: "erp",
                        principalTable: "containers",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_invoice_items_contract_items_contract_item_id",
                        column: x => x.contract_item_id,
                        principalSchema: "erp",
                        principalTable: "contract_items",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_invoice_items_invoices_invoice_id",
                        column: x => x.invoice_id,
                        principalSchema: "erp",
                        principalTable: "invoices",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "payment_items",
                schema: "erp",
                columns: table => new
                {
                    id = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    payment_id = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    invoice_id = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: true),
                    date = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    amount = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: false),
                    currency = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    fx_rate = table.Column<decimal>(type: "numeric(18,6)", precision: 18, scale: 6, nullable: false),
                    amount_usd = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: false),
                    method = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    bank_account_id = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: true),
                    cheque_id = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_payment_items", x => x.id);
                    table.CheckConstraint("ck_payment_items_currency", "\"currency\" IN ('USD', 'AED', 'IQD')");
                    table.CheckConstraint("ck_payment_items_fx_rate", "fx_rate > 0");
                    table.CheckConstraint("ck_payment_items_method", "\"method\" IN ('TT', 'Cash', 'Cheque', 'Offset', 'Credit Note')");
                    table.CheckConstraint("ck_payment_items_method_target", "(method IN ('TT', 'Cash') AND bank_account_id IS NOT NULL) OR (method = 'Cheque' AND cheque_id IS NOT NULL) OR method IN ('Offset', 'Credit Note')");
                    table.ForeignKey(
                        name: "fk_payment_items_cheques_cheque_id",
                        column: x => x.cheque_id,
                        principalSchema: "erp",
                        principalTable: "cheques",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_payment_items_financial_accounts_bank_account_id",
                        column: x => x.bank_account_id,
                        principalSchema: "erp",
                        principalTable: "financial_accounts",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_payment_items_invoices_invoice_id",
                        column: x => x.invoice_id,
                        principalSchema: "erp",
                        principalTable: "invoices",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_payment_items_payments_payment_id",
                        column: x => x.payment_id,
                        principalSchema: "erp",
                        principalTable: "payments",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "charge_lines",
                schema: "erp",
                columns: table => new
                {
                    id = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    doc_id = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    category_id = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    date = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    amount = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: false),
                    currency = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    fx_rate = table.Column<decimal>(type: "numeric(18,6)", precision: 18, scale: 6, nullable: false),
                    amount_usd = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: false),
                    cost_centre_id = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: true),
                    person_id = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: true),
                    description = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: true),
                    quantity_basis_mt = table.Column<decimal>(type: "numeric(18,3)", precision: 18, scale: 3, nullable: true),
                    unit_price_usd = table.Column<decimal>(type: "numeric(18,4)", precision: 18, scale: 4, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_charge_lines", x => x.id);
                    table.CheckConstraint("ck_charge_lines_currency", "\"currency\" IN ('USD', 'AED', 'IQD')");
                    table.CheckConstraint("ck_charge_lines_fx_rate", "fx_rate > 0");
                    table.ForeignKey(
                        name: "fk_charge_lines_charge_categories_category_id",
                        column: x => x.category_id,
                        principalSchema: "erp",
                        principalTable: "charge_categories",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_charge_lines_charge_docs_doc_id",
                        column: x => x.doc_id,
                        principalSchema: "erp",
                        principalTable: "charge_docs",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "fk_charge_lines_cost_centres_cost_centre_id",
                        column: x => x.cost_centre_id,
                        principalSchema: "erp",
                        principalTable: "cost_centres",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_charge_lines_customers_person_id",
                        column: x => x.person_id,
                        principalSchema: "erp",
                        principalTable: "customers",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "claim_items",
                schema: "erp",
                columns: table => new
                {
                    id = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    claim_id = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    invoice_item_id = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    reference_document_item_id = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    product = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    quantity_mt = table.Column<decimal>(type: "numeric(18,3)", precision: 18, scale: 3, nullable: false),
                    amount = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: false),
                    amount_usd = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: false),
                    description = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_claim_items", x => x.id);
                    table.ForeignKey(
                        name: "fk_claim_items_claims_claim_id",
                        column: x => x.claim_id,
                        principalSchema: "erp",
                        principalTable: "claims",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "inventory_document_items",
                schema: "erp",
                columns: table => new
                {
                    id = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    document_id = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    invoice_item_id = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: true),
                    reference_document_item_id = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    product = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    quantity_mt = table.Column<decimal>(type: "numeric(18,3)", precision: 18, scale: 3, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_inventory_document_items", x => x.id);
                    table.ForeignKey(
                        name: "fk_inventory_document_items_inventory_documents_document_id",
                        column: x => x.document_id,
                        principalSchema: "erp",
                        principalTable: "inventory_documents",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "payment_item_allocations",
                schema: "erp",
                columns: table => new
                {
                    id = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    payment_item_id = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    invoice_item_id = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    reference_document_item_id = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    product = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    amount = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: false),
                    amount_usd = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_payment_item_allocations", x => x.id);
                    table.ForeignKey(
                        name: "fk_payment_item_allocations_payment_items_payment_item_id",
                        column: x => x.payment_item_id,
                        principalSchema: "erp",
                        principalTable: "payment_items",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "charge_allocations",
                schema: "erp",
                columns: table => new
                {
                    id = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    line_id = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    invoice_item_id = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    reference_document_item_id = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    product = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    quantity_mt = table.Column<decimal>(type: "numeric(18,3)", precision: 18, scale: 3, nullable: false),
                    amount = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: false),
                    amount_usd = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_charge_allocations", x => x.id);
                    table.ForeignKey(
                        name: "fk_charge_allocations_charge_lines_line_id",
                        column: x => x.line_id,
                        principalSchema: "erp",
                        principalTable: "charge_lines",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "ix_charge_allocations_line_id",
                schema: "erp",
                table: "charge_allocations",
                column: "line_id");

            migrationBuilder.CreateIndex(
                name: "ix_charge_allocations_reference_document_item_id",
                schema: "erp",
                table: "charge_allocations",
                column: "reference_document_item_id");

            migrationBuilder.CreateIndex(
                name: "ix_charge_categories_direction_code",
                schema: "erp",
                table: "charge_categories",
                columns: new[] { "direction", "code" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_charge_docs_direction",
                schema: "erp",
                table: "charge_docs",
                column: "direction");

            migrationBuilder.CreateIndex(
                name: "ix_charge_docs_invoice_id",
                schema: "erp",
                table: "charge_docs",
                column: "invoice_id");

            migrationBuilder.CreateIndex(
                name: "ix_charge_lines_category_id",
                schema: "erp",
                table: "charge_lines",
                column: "category_id");

            migrationBuilder.CreateIndex(
                name: "ix_charge_lines_cost_centre_id",
                schema: "erp",
                table: "charge_lines",
                column: "cost_centre_id");

            migrationBuilder.CreateIndex(
                name: "ix_charge_lines_doc_id",
                schema: "erp",
                table: "charge_lines",
                column: "doc_id");

            migrationBuilder.CreateIndex(
                name: "ix_charge_lines_person_id",
                schema: "erp",
                table: "charge_lines",
                column: "person_id");

            migrationBuilder.CreateIndex(
                name: "ix_cheques_bank_account_id",
                schema: "erp",
                table: "cheques",
                column: "bank_account_id");

            migrationBuilder.CreateIndex(
                name: "ux_cheques_number_per_bank",
                schema: "erp",
                table: "cheques",
                columns: new[] { "bank_name", "number" },
                unique: true,
                filter: "status <> 'RETURNED'");

            migrationBuilder.CreateIndex(
                name: "ix_claim_items_claim_id",
                schema: "erp",
                table: "claim_items",
                column: "claim_id");

            migrationBuilder.CreateIndex(
                name: "ix_claim_items_reference_document_item_id",
                schema: "erp",
                table: "claim_items",
                column: "reference_document_item_id");

            migrationBuilder.CreateIndex(
                name: "ix_claims_invoice_id",
                schema: "erp",
                table: "claims",
                column: "invoice_id");

            migrationBuilder.CreateIndex(
                name: "ix_claims_party_id",
                schema: "erp",
                table: "claims",
                column: "party_id");

            migrationBuilder.CreateIndex(
                name: "ix_container_goods_contract_item_id",
                schema: "erp",
                table: "container_goods",
                column: "contract_item_id");

            migrationBuilder.CreateIndex(
                name: "ix_containers_reference",
                schema: "erp",
                table: "containers",
                column: "reference");

            migrationBuilder.CreateIndex(
                name: "ix_contract_items_contract_id",
                schema: "erp",
                table: "contract_items",
                column: "contract_id");

            migrationBuilder.CreateIndex(
                name: "ix_contracts_customer_id",
                schema: "erp",
                table: "contracts",
                column: "customer_id");

            migrationBuilder.CreateIndex(
                name: "ix_cost_centres_code",
                schema: "erp",
                table: "cost_centres",
                column: "code",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_customers_code",
                schema: "erp",
                table: "customers",
                column: "code",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ux_customers_portal_account",
                schema: "erp",
                table: "customers",
                column: "portal_account",
                unique: true,
                filter: "portal_account = true");

            migrationBuilder.CreateIndex(
                name: "ix_exchange_gain_losses_number",
                schema: "erp",
                table: "exchange_gain_losses",
                column: "number",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_goods_code",
                schema: "erp",
                table: "goods",
                column: "code",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_inventory_document_items_document_id",
                schema: "erp",
                table: "inventory_document_items",
                column: "document_id");

            migrationBuilder.CreateIndex(
                name: "ix_inventory_document_items_reference_document_item_id",
                schema: "erp",
                table: "inventory_document_items",
                column: "reference_document_item_id");

            migrationBuilder.CreateIndex(
                name: "ix_inventory_documents_doc_number",
                schema: "erp",
                table: "inventory_documents",
                column: "doc_number",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_inventory_documents_invoice_id",
                schema: "erp",
                table: "inventory_documents",
                column: "invoice_id");

            migrationBuilder.CreateIndex(
                name: "ix_inventory_documents_warehouse_id",
                schema: "erp",
                table: "inventory_documents",
                column: "warehouse_id");

            migrationBuilder.CreateIndex(
                name: "ix_invoice_items_container_id",
                schema: "erp",
                table: "invoice_items",
                column: "container_id");

            migrationBuilder.CreateIndex(
                name: "ix_invoice_items_contract_item_id",
                schema: "erp",
                table: "invoice_items",
                column: "contract_item_id");

            migrationBuilder.CreateIndex(
                name: "ix_invoice_items_invoice_id",
                schema: "erp",
                table: "invoice_items",
                column: "invoice_id");

            migrationBuilder.CreateIndex(
                name: "ix_invoice_items_reference_document_item_id",
                schema: "erp",
                table: "invoice_items",
                column: "reference_document_item_id");

            migrationBuilder.CreateIndex(
                name: "ix_invoices_contract_id",
                schema: "erp",
                table: "invoices",
                column: "contract_id");

            migrationBuilder.CreateIndex(
                name: "ix_invoices_customer_id",
                schema: "erp",
                table: "invoices",
                column: "customer_id");

            migrationBuilder.CreateIndex(
                name: "ix_invoices_invoice_number",
                schema: "erp",
                table: "invoices",
                column: "invoice_number",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ux_invoices_live_successor",
                schema: "erp",
                table: "invoices",
                column: "ref_invoice_id",
                unique: true,
                filter: "ref_invoice_id IS NOT NULL AND status <> 'CANCELLED'");

            migrationBuilder.CreateIndex(
                name: "ix_item_partners_partner_id",
                schema: "erp",
                table: "item_partners",
                column: "partner_id");

            migrationBuilder.CreateIndex(
                name: "ix_money_transfer_allocations_transfer_id",
                schema: "erp",
                table: "money_transfer_allocations",
                column: "transfer_id");

            migrationBuilder.CreateIndex(
                name: "ix_money_transfers_from_account_id",
                schema: "erp",
                table: "money_transfers",
                column: "from_account_id");

            migrationBuilder.CreateIndex(
                name: "ix_money_transfers_number",
                schema: "erp",
                table: "money_transfers",
                column: "number",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_money_transfers_to_account_id",
                schema: "erp",
                table: "money_transfers",
                column: "to_account_id");

            migrationBuilder.CreateIndex(
                name: "ix_partners_code",
                schema: "erp",
                table: "partners",
                column: "code",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_payment_item_allocations_payment_item_id",
                schema: "erp",
                table: "payment_item_allocations",
                column: "payment_item_id");

            migrationBuilder.CreateIndex(
                name: "ix_payment_item_allocations_reference_document_item_id",
                schema: "erp",
                table: "payment_item_allocations",
                column: "reference_document_item_id");

            migrationBuilder.CreateIndex(
                name: "ix_payment_items_bank_account_id",
                schema: "erp",
                table: "payment_items",
                column: "bank_account_id");

            migrationBuilder.CreateIndex(
                name: "ix_payment_items_cheque_id",
                schema: "erp",
                table: "payment_items",
                column: "cheque_id");

            migrationBuilder.CreateIndex(
                name: "ix_payment_items_invoice_id",
                schema: "erp",
                table: "payment_items",
                column: "invoice_id");

            migrationBuilder.CreateIndex(
                name: "ix_payment_items_payment_id",
                schema: "erp",
                table: "payment_items",
                column: "payment_id");

            migrationBuilder.CreateIndex(
                name: "ix_payments_customer_id",
                schema: "erp",
                table: "payments",
                column: "customer_id");

            migrationBuilder.CreateIndex(
                name: "ix_payments_status",
                schema: "erp",
                table: "payments",
                column: "status");

            migrationBuilder.CreateIndex(
                name: "ix_warehouses_code",
                schema: "erp",
                table: "warehouses",
                column: "code",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "charge_allocations",
                schema: "erp");

            migrationBuilder.DropTable(
                name: "claim_items",
                schema: "erp");

            migrationBuilder.DropTable(
                name: "container_goods",
                schema: "erp");

            migrationBuilder.DropTable(
                name: "exchange_gain_losses",
                schema: "erp");

            migrationBuilder.DropTable(
                name: "goods",
                schema: "erp");

            migrationBuilder.DropTable(
                name: "inventory_document_items",
                schema: "erp");

            migrationBuilder.DropTable(
                name: "invoice_items",
                schema: "erp");

            migrationBuilder.DropTable(
                name: "item_partners",
                schema: "erp");

            migrationBuilder.DropTable(
                name: "money_transfer_allocations",
                schema: "erp");

            migrationBuilder.DropTable(
                name: "payment_item_allocations",
                schema: "erp");

            migrationBuilder.DropTable(
                name: "settings",
                schema: "erp");

            migrationBuilder.DropTable(
                name: "charge_lines",
                schema: "erp");

            migrationBuilder.DropTable(
                name: "claims",
                schema: "erp");

            migrationBuilder.DropTable(
                name: "inventory_documents",
                schema: "erp");

            migrationBuilder.DropTable(
                name: "containers",
                schema: "erp");

            migrationBuilder.DropTable(
                name: "contract_items",
                schema: "erp");

            migrationBuilder.DropTable(
                name: "partners",
                schema: "erp");

            migrationBuilder.DropTable(
                name: "money_transfers",
                schema: "erp");

            migrationBuilder.DropTable(
                name: "payment_items",
                schema: "erp");

            migrationBuilder.DropTable(
                name: "charge_categories",
                schema: "erp");

            migrationBuilder.DropTable(
                name: "charge_docs",
                schema: "erp");

            migrationBuilder.DropTable(
                name: "cost_centres",
                schema: "erp");

            migrationBuilder.DropTable(
                name: "warehouses",
                schema: "erp");

            migrationBuilder.DropTable(
                name: "cheques",
                schema: "erp");

            migrationBuilder.DropTable(
                name: "payments",
                schema: "erp");

            migrationBuilder.DropTable(
                name: "invoices",
                schema: "erp");

            migrationBuilder.DropTable(
                name: "financial_accounts",
                schema: "erp");

            migrationBuilder.DropTable(
                name: "contracts",
                schema: "erp");

            migrationBuilder.DropTable(
                name: "customers",
                schema: "erp");
        }
    }
}
