using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Finora.Erp.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddConversions : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<decimal>(
                name: "cost_usd",
                schema: "erp",
                table: "inventory_document_items",
                type: "numeric(18,2)",
                precision: 18,
                scale: 2,
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.AddColumn<decimal>(
                name: "unit_cost_usd",
                schema: "erp",
                table: "inventory_document_items",
                type: "numeric(18,4)",
                precision: 18,
                scale: 4,
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.CreateTable(
                name: "conversion_documents",
                schema: "erp",
                columns: table => new
                {
                    id = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    doc_number = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    warehouse_id = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    date = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    status = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    notes = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: true),
                    charge_doc_id = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: true),
                    total_input_cost_usd = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: false),
                    total_added_cost_usd = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_conversion_documents", x => x.id);
                    table.CheckConstraint("ck_conversion_documents_status", "\"status\" IN ('DRAFT', 'CONFIRMED', 'CANCELLED')");
                    table.ForeignKey(
                        name: "fk_conversion_documents_warehouses_warehouse_id",
                        column: x => x.warehouse_id,
                        principalSchema: "erp",
                        principalTable: "warehouses",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "conversion_costs",
                schema: "erp",
                columns: table => new
                {
                    id = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    document_id = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    category_id = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    person_id = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    amount = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: false),
                    currency = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    fx_rate = table.Column<decimal>(type: "numeric(18,6)", precision: 18, scale: 6, nullable: false),
                    amount_usd = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: false),
                    description = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_conversion_costs", x => x.id);
                    table.CheckConstraint("ck_conversion_costs_currency", "\"currency\" IN ('USD', 'AED', 'IQD')");
                    table.ForeignKey(
                        name: "fk_conversion_costs_charge_categories_category_id",
                        column: x => x.category_id,
                        principalSchema: "erp",
                        principalTable: "charge_categories",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_conversion_costs_conversion_documents_document_id",
                        column: x => x.document_id,
                        principalSchema: "erp",
                        principalTable: "conversion_documents",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "fk_conversion_costs_customers_person_id",
                        column: x => x.person_id,
                        principalSchema: "erp",
                        principalTable: "customers",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "conversion_inputs",
                schema: "erp",
                columns: table => new
                {
                    id = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    document_id = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    product = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    quantity_mt = table.Column<decimal>(type: "numeric(18,3)", precision: 18, scale: 3, nullable: false),
                    unit_cost_usd = table.Column<decimal>(type: "numeric(18,4)", precision: 18, scale: 4, nullable: false),
                    cost_usd = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_conversion_inputs", x => x.id);
                    table.ForeignKey(
                        name: "fk_conversion_inputs_conversion_documents_document_id",
                        column: x => x.document_id,
                        principalSchema: "erp",
                        principalTable: "conversion_documents",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "conversion_outputs",
                schema: "erp",
                columns: table => new
                {
                    id = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    document_id = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    product = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    quantity_mt = table.Column<decimal>(type: "numeric(18,3)", precision: 18, scale: 3, nullable: false),
                    share_percent = table.Column<decimal>(type: "numeric(9,4)", precision: 9, scale: 4, nullable: true),
                    unit_cost_usd = table.Column<decimal>(type: "numeric(18,4)", precision: 18, scale: 4, nullable: false),
                    cost_usd = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_conversion_outputs", x => x.id);
                    table.ForeignKey(
                        name: "fk_conversion_outputs_conversion_documents_document_id",
                        column: x => x.document_id,
                        principalSchema: "erp",
                        principalTable: "conversion_documents",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "ix_conversion_costs_category_id",
                schema: "erp",
                table: "conversion_costs",
                column: "category_id");

            migrationBuilder.CreateIndex(
                name: "ix_conversion_costs_document_id",
                schema: "erp",
                table: "conversion_costs",
                column: "document_id");

            migrationBuilder.CreateIndex(
                name: "ix_conversion_costs_person_id",
                schema: "erp",
                table: "conversion_costs",
                column: "person_id");

            migrationBuilder.CreateIndex(
                name: "ix_conversion_documents_doc_number",
                schema: "erp",
                table: "conversion_documents",
                column: "doc_number",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_conversion_documents_warehouse_id",
                schema: "erp",
                table: "conversion_documents",
                column: "warehouse_id");

            migrationBuilder.CreateIndex(
                name: "ix_conversion_inputs_document_id",
                schema: "erp",
                table: "conversion_inputs",
                column: "document_id");

            migrationBuilder.CreateIndex(
                name: "ix_conversion_outputs_document_id",
                schema: "erp",
                table: "conversion_outputs",
                column: "document_id");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "conversion_costs",
                schema: "erp");

            migrationBuilder.DropTable(
                name: "conversion_inputs",
                schema: "erp");

            migrationBuilder.DropTable(
                name: "conversion_outputs",
                schema: "erp");

            migrationBuilder.DropTable(
                name: "conversion_documents",
                schema: "erp");

            migrationBuilder.DropColumn(
                name: "cost_usd",
                schema: "erp",
                table: "inventory_document_items");

            migrationBuilder.DropColumn(
                name: "unit_cost_usd",
                schema: "erp",
                table: "inventory_document_items");
        }
    }
}
