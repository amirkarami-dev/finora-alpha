using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Finora.Erp.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddContractItemChanges : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "contract_item_changes",
                schema: "erp",
                columns: table => new
                {
                    id = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    contract_item_id = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    user_id = table.Column<Guid>(type: "uuid", nullable: false),
                    user_name = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    delta_mt = table.Column<decimal>(type: "numeric(18,6)", precision: 18, scale: 6, nullable: false),
                    before_mt = table.Column<decimal>(type: "numeric(18,6)", precision: 18, scale: 6, nullable: false),
                    after_mt = table.Column<decimal>(type: "numeric(18,6)", precision: 18, scale: 6, nullable: false),
                    note = table.Column<string>(type: "character varying(300)", maxLength: 300, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_contract_item_changes", x => x.id);
                    table.CheckConstraint("ck_contract_item_changes_delta", "delta_mt <> 0");
                    table.ForeignKey(
                        name: "fk_contract_item_changes_contract_items_contract_item_id",
                        column: x => x.contract_item_id,
                        principalSchema: "erp",
                        principalTable: "contract_items",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "ix_contract_item_changes_contract_item_id",
                schema: "erp",
                table: "contract_item_changes",
                column: "contract_item_id");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "contract_item_changes",
                schema: "erp");
        }
    }
}
