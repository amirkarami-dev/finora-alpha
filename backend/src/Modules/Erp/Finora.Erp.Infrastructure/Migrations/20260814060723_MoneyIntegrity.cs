using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Finora.Erp.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class MoneyIntegrity : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Cheque numbers are unique per issuing bank, and the spec compares them trimmed and
            // case-insensitively so "ENBD" and "enbd " cannot become two banks. The plain index
            // compared the raw text, so the database accepted pairs the application refuses.
            // A RETURNED cheque is exempt: replacing a bounced cheque reuses its number.
            migrationBuilder.Sql("""
                DROP INDEX IF EXISTS erp.ux_cheques_number_per_bank;
                CREATE UNIQUE INDEX ux_cheques_number_per_bank
                    ON erp.cheques (lower(btrim(bank_name)), lower(btrim(number)))
                    WHERE status <> 'RETURNED';
                """);

            migrationBuilder.CreateIndex(
                name: "ix_payments_invoice_id",
                schema: "erp",
                table: "payments",
                column: "invoice_id");

            migrationBuilder.AddCheckConstraint(
                name: "ck_payments_amount",
                schema: "erp",
                table: "payments",
                sql: "amount > 0");

            migrationBuilder.AddCheckConstraint(
                name: "ck_payment_items_amount",
                schema: "erp",
                table: "payment_items",
                sql: "amount > 0");

            migrationBuilder.CreateIndex(
                name: "ix_payment_item_allocations_invoice_item_id",
                schema: "erp",
                table: "payment_item_allocations",
                column: "invoice_item_id");

            migrationBuilder.AddCheckConstraint(
                name: "ck_payment_item_allocations_amount",
                schema: "erp",
                table: "payment_item_allocations",
                sql: "amount > 0");

            migrationBuilder.AddCheckConstraint(
                name: "ck_cheques_amount",
                schema: "erp",
                table: "cheques",
                sql: "amount > 0");

            migrationBuilder.AddForeignKey(
                name: "fk_payment_item_allocations_invoice_items_invoice_item_id",
                schema: "erp",
                table: "payment_item_allocations",
                column: "invoice_item_id",
                principalSchema: "erp",
                principalTable: "invoice_items",
                principalColumn: "id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "fk_payments_invoices_invoice_id",
                schema: "erp",
                table: "payments",
                column: "invoice_id",
                principalSchema: "erp",
                principalTable: "invoices",
                principalColumn: "id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("""
                DROP INDEX IF EXISTS erp.ux_cheques_number_per_bank;
                CREATE UNIQUE INDEX ux_cheques_number_per_bank
                    ON erp.cheques (bank_name, number)
                    WHERE status <> 'RETURNED';
                """);

            migrationBuilder.DropForeignKey(
                name: "fk_payment_item_allocations_invoice_items_invoice_item_id",
                schema: "erp",
                table: "payment_item_allocations");

            migrationBuilder.DropForeignKey(
                name: "fk_payments_invoices_invoice_id",
                schema: "erp",
                table: "payments");

            migrationBuilder.DropIndex(
                name: "ix_payments_invoice_id",
                schema: "erp",
                table: "payments");

            migrationBuilder.DropCheckConstraint(
                name: "ck_payments_amount",
                schema: "erp",
                table: "payments");

            migrationBuilder.DropCheckConstraint(
                name: "ck_payment_items_amount",
                schema: "erp",
                table: "payment_items");

            migrationBuilder.DropIndex(
                name: "ix_payment_item_allocations_invoice_item_id",
                schema: "erp",
                table: "payment_item_allocations");

            migrationBuilder.DropCheckConstraint(
                name: "ck_payment_item_allocations_amount",
                schema: "erp",
                table: "payment_item_allocations");

            migrationBuilder.DropCheckConstraint(
                name: "ck_cheques_amount",
                schema: "erp",
                table: "cheques");
        }
    }
}
