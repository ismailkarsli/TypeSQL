import { createSql } from "@typesql/core";
import { type Col, postgresDialect, type Sig } from "@typesql/core/postgres";

interface DB {
	invitations: { id: Col<"uuid"> };
	$functions: {
		"app.user_count": Sig<[], "int8">;
		"app.band_pending_invitations": Sig<["uuid"], "text">;
	};
}
const sql = createSql<DB>(postgresDialect);

// An unknown function with a long name is named in the message.
sql("SELECT invitation_preview(id) FROM invitations");
sql("SELECT * FROM app.invitation_preview(gen_random_uuid()) p");
// A long name one letter off is suggested.
sql("SELECT app.band_pending_invitation(id) FROM invitations");
// A function declared under its schema is suggested to an unqualified call.
sql("SELECT user_count() AS n");
