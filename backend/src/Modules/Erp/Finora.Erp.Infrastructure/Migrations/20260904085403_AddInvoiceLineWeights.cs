using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Finora.Erp.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddInvoiceLineWeights : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<decimal>(
                name: "gross_mt",
                schema: "erp",
                table: "invoice_items",
                type: "numeric(18,6)",
                precision: 18,
                scale: 6,
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "tare_mt",
                schema: "erp",
                table: "invoice_items",
                type: "numeric(18,6)",
                precision: 18,
                scale: 6,
                nullable: true);

            // Lines that already exist on the four invoice types get gross = net and tare = 0,
            // so every stored invoice line satisfies the new rule (spec §2). Order lines stay
            // null — they carry a quantity only. The wire names are what `EnumNames.ToWire`
            // stores for `InvoiceType` (the enum member name).
            migrationBuilder.Sql("""
                UPDATE erp.invoice_items AS ii
                SET gross_mt = ii.quantity_mt, tare_mt = 0
                FROM erp.invoices AS i
                WHERE i.id = ii.invoice_id
                  AND i.invoice_type NOT IN ('PURCHASE_ORDER', 'SALE_ORDER');
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "gross_mt",
                schema: "erp",
                table: "invoice_items");

            migrationBuilder.DropColumn(
                name: "tare_mt",
                schema: "erp",
                table: "invoice_items");
        }
    }
}
