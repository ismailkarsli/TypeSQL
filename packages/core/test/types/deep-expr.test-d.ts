import { expectTypeOf, test } from "vitest";
import type { Params, Row, V } from "./_schema.js";

// Compile-time limits for large statements (ENGINE.md pitfall 12). AND / OR chains are parsed
// into balanced trees, so their depth is log2(n); other left-nested operator chains (`||`,
// `+`) and very long CASE lists are bounded by the typer's recursion (about 100 terms), and
// the parameter pass by about 45 `$n` occurrences.
// Statement sizes in bytes are noted next to each probe.

test("200-term OR / AND chains", () => {
	// 2315 bytes
	expectTypeOf<
		V<"SELECT id FROM users WHERE id = 1 OR id = 2 OR id = 3 OR id = 4 OR id = 5 OR id = 6 OR id = 7 OR id = 8 OR id = 9 OR id = 10 OR id = 11 OR id = 12 OR id = 13 OR id = 14 OR id = 15 OR id = 16 OR id = 17 OR id = 18 OR id = 19 OR id = 20 OR id = 21 OR id = 22 OR id = 23 OR id = 24 OR id = 25 OR id = 26 OR id = 27 OR id = 28 OR id = 29 OR id = 30 OR id = 31 OR id = 32 OR id = 33 OR id = 34 OR id = 35 OR id = 36 OR id = 37 OR id = 38 OR id = 39 OR id = 40 OR id = 41 OR id = 42 OR id = 43 OR id = 44 OR id = 45 OR id = 46 OR id = 47 OR id = 48 OR id = 49 OR id = 50 OR id = 51 OR id = 52 OR id = 53 OR id = 54 OR id = 55 OR id = 56 OR id = 57 OR id = 58 OR id = 59 OR id = 60 OR id = 61 OR id = 62 OR id = 63 OR id = 64 OR id = 65 OR id = 66 OR id = 67 OR id = 68 OR id = 69 OR id = 70 OR id = 71 OR id = 72 OR id = 73 OR id = 74 OR id = 75 OR id = 76 OR id = 77 OR id = 78 OR id = 79 OR id = 80 OR id = 81 OR id = 82 OR id = 83 OR id = 84 OR id = 85 OR id = 86 OR id = 87 OR id = 88 OR id = 89 OR id = 90 OR id = 91 OR id = 92 OR id = 93 OR id = 94 OR id = 95 OR id = 96 OR id = 97 OR id = 98 OR id = 99 OR id = 100 OR id = 101 OR id = 102 OR id = 103 OR id = 104 OR id = 105 OR id = 106 OR id = 107 OR id = 108 OR id = 109 OR id = 110 OR id = 111 OR id = 112 OR id = 113 OR id = 114 OR id = 115 OR id = 116 OR id = 117 OR id = 118 OR id = 119 OR id = 120 OR id = 121 OR id = 122 OR id = 123 OR id = 124 OR id = 125 OR id = 126 OR id = 127 OR id = 128 OR id = 129 OR id = 130 OR id = 131 OR id = 132 OR id = 133 OR id = 134 OR id = 135 OR id = 136 OR id = 137 OR id = 138 OR id = 139 OR id = 140 OR id = 141 OR id = 142 OR id = 143 OR id = 144 OR id = 145 OR id = 146 OR id = 147 OR id = 148 OR id = 149 OR id = 150 OR id = 151 OR id = 152 OR id = 153 OR id = 154 OR id = 155 OR id = 156 OR id = 157 OR id = 158 OR id = 159 OR id = 160 OR id = 161 OR id = 162 OR id = 163 OR id = 164 OR id = 165 OR id = 166 OR id = 167 OR id = 168 OR id = 169 OR id = 170 OR id = 171 OR id = 172 OR id = 173 OR id = 174 OR id = 175 OR id = 176 OR id = 177 OR id = 178 OR id = 179 OR id = 180 OR id = 181 OR id = 182 OR id = 183 OR id = 184 OR id = 185 OR id = 186 OR id = 187 OR id = 188 OR id = 189 OR id = 190 OR id = 191 OR id = 192 OR id = 193 OR id = 194 OR id = 195 OR id = 196 OR id = 197 OR id = 198 OR id = 199 OR id = 200">
	>().toEqualTypeOf<"SELECT id FROM users WHERE id = 1 OR id = 2 OR id = 3 OR id = 4 OR id = 5 OR id = 6 OR id = 7 OR id = 8 OR id = 9 OR id = 10 OR id = 11 OR id = 12 OR id = 13 OR id = 14 OR id = 15 OR id = 16 OR id = 17 OR id = 18 OR id = 19 OR id = 20 OR id = 21 OR id = 22 OR id = 23 OR id = 24 OR id = 25 OR id = 26 OR id = 27 OR id = 28 OR id = 29 OR id = 30 OR id = 31 OR id = 32 OR id = 33 OR id = 34 OR id = 35 OR id = 36 OR id = 37 OR id = 38 OR id = 39 OR id = 40 OR id = 41 OR id = 42 OR id = 43 OR id = 44 OR id = 45 OR id = 46 OR id = 47 OR id = 48 OR id = 49 OR id = 50 OR id = 51 OR id = 52 OR id = 53 OR id = 54 OR id = 55 OR id = 56 OR id = 57 OR id = 58 OR id = 59 OR id = 60 OR id = 61 OR id = 62 OR id = 63 OR id = 64 OR id = 65 OR id = 66 OR id = 67 OR id = 68 OR id = 69 OR id = 70 OR id = 71 OR id = 72 OR id = 73 OR id = 74 OR id = 75 OR id = 76 OR id = 77 OR id = 78 OR id = 79 OR id = 80 OR id = 81 OR id = 82 OR id = 83 OR id = 84 OR id = 85 OR id = 86 OR id = 87 OR id = 88 OR id = 89 OR id = 90 OR id = 91 OR id = 92 OR id = 93 OR id = 94 OR id = 95 OR id = 96 OR id = 97 OR id = 98 OR id = 99 OR id = 100 OR id = 101 OR id = 102 OR id = 103 OR id = 104 OR id = 105 OR id = 106 OR id = 107 OR id = 108 OR id = 109 OR id = 110 OR id = 111 OR id = 112 OR id = 113 OR id = 114 OR id = 115 OR id = 116 OR id = 117 OR id = 118 OR id = 119 OR id = 120 OR id = 121 OR id = 122 OR id = 123 OR id = 124 OR id = 125 OR id = 126 OR id = 127 OR id = 128 OR id = 129 OR id = 130 OR id = 131 OR id = 132 OR id = 133 OR id = 134 OR id = 135 OR id = 136 OR id = 137 OR id = 138 OR id = 139 OR id = 140 OR id = 141 OR id = 142 OR id = 143 OR id = 144 OR id = 145 OR id = 146 OR id = 147 OR id = 148 OR id = 149 OR id = 150 OR id = 151 OR id = 152 OR id = 153 OR id = 154 OR id = 155 OR id = 156 OR id = 157 OR id = 158 OR id = 159 OR id = 160 OR id = 161 OR id = 162 OR id = 163 OR id = 164 OR id = 165 OR id = 166 OR id = 167 OR id = 168 OR id = 169 OR id = 170 OR id = 171 OR id = 172 OR id = 173 OR id = 174 OR id = 175 OR id = 176 OR id = 177 OR id = 178 OR id = 179 OR id = 180 OR id = 181 OR id = 182 OR id = 183 OR id = 184 OR id = 185 OR id = 186 OR id = 187 OR id = 188 OR id = 189 OR id = 190 OR id = 191 OR id = 192 OR id = 193 OR id = 194 OR id = 195 OR id = 196 OR id = 197 OR id = 198 OR id = 199 OR id = 200">();
	expectTypeOf<
		Row<"SELECT id FROM users WHERE id = 1 OR id = 2 OR id = 3 OR id = 4 OR id = 5 OR id = 6 OR id = 7 OR id = 8 OR id = 9 OR id = 10 OR id = 11 OR id = 12 OR id = 13 OR id = 14 OR id = 15 OR id = 16 OR id = 17 OR id = 18 OR id = 19 OR id = 20 OR id = 21 OR id = 22 OR id = 23 OR id = 24 OR id = 25 OR id = 26 OR id = 27 OR id = 28 OR id = 29 OR id = 30 OR id = 31 OR id = 32 OR id = 33 OR id = 34 OR id = 35 OR id = 36 OR id = 37 OR id = 38 OR id = 39 OR id = 40 OR id = 41 OR id = 42 OR id = 43 OR id = 44 OR id = 45 OR id = 46 OR id = 47 OR id = 48 OR id = 49 OR id = 50 OR id = 51 OR id = 52 OR id = 53 OR id = 54 OR id = 55 OR id = 56 OR id = 57 OR id = 58 OR id = 59 OR id = 60 OR id = 61 OR id = 62 OR id = 63 OR id = 64 OR id = 65 OR id = 66 OR id = 67 OR id = 68 OR id = 69 OR id = 70 OR id = 71 OR id = 72 OR id = 73 OR id = 74 OR id = 75 OR id = 76 OR id = 77 OR id = 78 OR id = 79 OR id = 80 OR id = 81 OR id = 82 OR id = 83 OR id = 84 OR id = 85 OR id = 86 OR id = 87 OR id = 88 OR id = 89 OR id = 90 OR id = 91 OR id = 92 OR id = 93 OR id = 94 OR id = 95 OR id = 96 OR id = 97 OR id = 98 OR id = 99 OR id = 100 OR id = 101 OR id = 102 OR id = 103 OR id = 104 OR id = 105 OR id = 106 OR id = 107 OR id = 108 OR id = 109 OR id = 110 OR id = 111 OR id = 112 OR id = 113 OR id = 114 OR id = 115 OR id = 116 OR id = 117 OR id = 118 OR id = 119 OR id = 120 OR id = 121 OR id = 122 OR id = 123 OR id = 124 OR id = 125 OR id = 126 OR id = 127 OR id = 128 OR id = 129 OR id = 130 OR id = 131 OR id = 132 OR id = 133 OR id = 134 OR id = 135 OR id = 136 OR id = 137 OR id = 138 OR id = 139 OR id = 140 OR id = 141 OR id = 142 OR id = 143 OR id = 144 OR id = 145 OR id = 146 OR id = 147 OR id = 148 OR id = 149 OR id = 150 OR id = 151 OR id = 152 OR id = 153 OR id = 154 OR id = 155 OR id = 156 OR id = 157 OR id = 158 OR id = 159 OR id = 160 OR id = 161 OR id = 162 OR id = 163 OR id = 164 OR id = 165 OR id = 166 OR id = 167 OR id = 168 OR id = 169 OR id = 170 OR id = 171 OR id = 172 OR id = 173 OR id = 174 OR id = 175 OR id = 176 OR id = 177 OR id = 178 OR id = 179 OR id = 180 OR id = 181 OR id = 182 OR id = 183 OR id = 184 OR id = 185 OR id = 186 OR id = 187 OR id = 188 OR id = 189 OR id = 190 OR id = 191 OR id = 192 OR id = 193 OR id = 194 OR id = 195 OR id = 196 OR id = 197 OR id = 198 OR id = 199 OR id = 200">
	>().toEqualTypeOf<{ id: number }>();
	// 2726 bytes
	expectTypeOf<
		Row<"SELECT id, display_name FROM users WHERE id <> 0 AND id <> 1 AND id <> 2 AND id <> 3 AND id <> 4 AND id <> 5 AND id <> 6 AND id <> 7 AND id <> 8 AND id <> 9 AND id <> 10 AND id <> 11 AND id <> 12 AND id <> 13 AND id <> 14 AND id <> 15 AND id <> 16 AND id <> 17 AND id <> 18 AND id <> 19 AND id <> 20 AND id <> 21 AND id <> 22 AND id <> 23 AND id <> 24 AND id <> 25 AND id <> 26 AND id <> 27 AND id <> 28 AND id <> 29 AND id <> 30 AND id <> 31 AND id <> 32 AND id <> 33 AND id <> 34 AND id <> 35 AND id <> 36 AND id <> 37 AND id <> 38 AND id <> 39 AND id <> 40 AND id <> 41 AND id <> 42 AND id <> 43 AND id <> 44 AND id <> 45 AND id <> 46 AND id <> 47 AND id <> 48 AND id <> 49 AND id <> 50 AND id <> 51 AND id <> 52 AND id <> 53 AND id <> 54 AND id <> 55 AND id <> 56 AND id <> 57 AND id <> 58 AND id <> 59 AND id <> 60 AND id <> 61 AND id <> 62 AND id <> 63 AND id <> 64 AND id <> 65 AND id <> 66 AND id <> 67 AND id <> 68 AND id <> 69 AND id <> 70 AND id <> 71 AND id <> 72 AND id <> 73 AND id <> 74 AND id <> 75 AND id <> 76 AND id <> 77 AND id <> 78 AND id <> 79 AND id <> 80 AND id <> 81 AND id <> 82 AND id <> 83 AND id <> 84 AND id <> 85 AND id <> 86 AND id <> 87 AND id <> 88 AND id <> 89 AND id <> 90 AND id <> 91 AND id <> 92 AND id <> 93 AND id <> 94 AND id <> 95 AND id <> 96 AND id <> 97 AND id <> 98 AND id <> 99 AND id <> 100 AND id <> 101 AND id <> 102 AND id <> 103 AND id <> 104 AND id <> 105 AND id <> 106 AND id <> 107 AND id <> 108 AND id <> 109 AND id <> 110 AND id <> 111 AND id <> 112 AND id <> 113 AND id <> 114 AND id <> 115 AND id <> 116 AND id <> 117 AND id <> 118 AND id <> 119 AND id <> 120 AND id <> 121 AND id <> 122 AND id <> 123 AND id <> 124 AND id <> 125 AND id <> 126 AND id <> 127 AND id <> 128 AND id <> 129 AND id <> 130 AND id <> 131 AND id <> 132 AND id <> 133 AND id <> 134 AND id <> 135 AND id <> 136 AND id <> 137 AND id <> 138 AND id <> 139 AND id <> 140 AND id <> 141 AND id <> 142 AND id <> 143 AND id <> 144 AND id <> 145 AND id <> 146 AND id <> 147 AND id <> 148 AND id <> 149 AND id <> 150 AND id <> 151 AND id <> 152 AND id <> 153 AND id <> 154 AND id <> 155 AND id <> 156 AND id <> 157 AND id <> 158 AND id <> 159 AND id <> 160 AND id <> 161 AND id <> 162 AND id <> 163 AND id <> 164 AND id <> 165 AND id <> 166 AND id <> 167 AND id <> 168 AND id <> 169 AND id <> 170 AND id <> 171 AND id <> 172 AND id <> 173 AND id <> 174 AND id <> 175 AND id <> 176 AND id <> 177 AND id <> 178 AND id <> 179 AND id <> 180 AND id <> 181 AND id <> 182 AND id <> 183 AND id <> 184 AND id <> 185 AND id <> 186 AND id <> 187 AND id <> 188 AND id <> 189 AND id <> 190 AND id <> 191 AND id <> 192 AND id <> 193 AND id <> 194 AND id <> 195 AND id <> 196 AND id <> 197 AND id <> 198 AND id <> 199">
	>().toEqualTypeOf<{ id: number; display_name: string | null }>();
	// 2311 bytes
	expectTypeOf<
		Row<"SELECT id = 0 OR id = 1 OR id = 2 OR id = 3 OR id = 4 OR id = 5 OR id = 6 OR id = 7 OR id = 8 OR id = 9 OR id = 10 OR id = 11 OR id = 12 OR id = 13 OR id = 14 OR id = 15 OR id = 16 OR id = 17 OR id = 18 OR id = 19 OR id = 20 OR id = 21 OR id = 22 OR id = 23 OR id = 24 OR id = 25 OR id = 26 OR id = 27 OR id = 28 OR id = 29 OR id = 30 OR id = 31 OR id = 32 OR id = 33 OR id = 34 OR id = 35 OR id = 36 OR id = 37 OR id = 38 OR id = 39 OR id = 40 OR id = 41 OR id = 42 OR id = 43 OR id = 44 OR id = 45 OR id = 46 OR id = 47 OR id = 48 OR id = 49 OR id = 50 OR id = 51 OR id = 52 OR id = 53 OR id = 54 OR id = 55 OR id = 56 OR id = 57 OR id = 58 OR id = 59 OR id = 60 OR id = 61 OR id = 62 OR id = 63 OR id = 64 OR id = 65 OR id = 66 OR id = 67 OR id = 68 OR id = 69 OR id = 70 OR id = 71 OR id = 72 OR id = 73 OR id = 74 OR id = 75 OR id = 76 OR id = 77 OR id = 78 OR id = 79 OR id = 80 OR id = 81 OR id = 82 OR id = 83 OR id = 84 OR id = 85 OR id = 86 OR id = 87 OR id = 88 OR id = 89 OR id = 90 OR id = 91 OR id = 92 OR id = 93 OR id = 94 OR id = 95 OR id = 96 OR id = 97 OR id = 98 OR id = 99 OR id = 100 OR id = 101 OR id = 102 OR id = 103 OR id = 104 OR id = 105 OR id = 106 OR id = 107 OR id = 108 OR id = 109 OR id = 110 OR id = 111 OR id = 112 OR id = 113 OR id = 114 OR id = 115 OR id = 116 OR id = 117 OR id = 118 OR id = 119 OR id = 120 OR id = 121 OR id = 122 OR id = 123 OR id = 124 OR id = 125 OR id = 126 OR id = 127 OR id = 128 OR id = 129 OR id = 130 OR id = 131 OR id = 132 OR id = 133 OR id = 134 OR id = 135 OR id = 136 OR id = 137 OR id = 138 OR id = 139 OR id = 140 OR id = 141 OR id = 142 OR id = 143 OR id = 144 OR id = 145 OR id = 146 OR id = 147 OR id = 148 OR id = 149 OR id = 150 OR id = 151 OR id = 152 OR id = 153 OR id = 154 OR id = 155 OR id = 156 OR id = 157 OR id = 158 OR id = 159 OR id = 160 OR id = 161 OR id = 162 OR id = 163 OR id = 164 OR id = 165 OR id = 166 OR id = 167 OR id = 168 OR id = 169 OR id = 170 OR id = 171 OR id = 172 OR id = 173 OR id = 174 OR id = 175 OR id = 176 OR id = 177 OR id = 178 OR id = 179 OR id = 180 OR id = 181 OR id = 182 OR id = 183 OR id = 184 OR id = 185 OR id = 186 OR id = 187 OR id = 188 OR id = 189 OR id = 190 OR id = 191 OR id = 192 OR id = 193 OR id = 194 OR id = 195 OR id = 196 OR id = 197 OR id = 198 OR id = 199 AS hit FROM users">
	>().toEqualTypeOf<{ hit: boolean }>();
});

test("mixed and nested boolean structure", () => {
	// 4367 bytes
	expectTypeOf<
		V<"SELECT u.id FROM users u WHERE (u.id = 0 AND u.email <> 'x0') OR (u.id = 1 AND u.email <> 'x1') OR (u.id = 2 AND u.email <> 'x2') OR (u.id = 3 AND u.email <> 'x3') OR (u.id = 4 AND u.email <> 'x4') OR (u.id = 5 AND u.email <> 'x5') OR (u.id = 6 AND u.email <> 'x6') OR (u.id = 7 AND u.email <> 'x7') OR (u.id = 8 AND u.email <> 'x8') OR (u.id = 9 AND u.email <> 'x9') OR (u.id = 10 AND u.email <> 'x10') OR (u.id = 11 AND u.email <> 'x11') OR (u.id = 12 AND u.email <> 'x12') OR (u.id = 13 AND u.email <> 'x13') OR (u.id = 14 AND u.email <> 'x14') OR (u.id = 15 AND u.email <> 'x15') OR (u.id = 16 AND u.email <> 'x16') OR (u.id = 17 AND u.email <> 'x17') OR (u.id = 18 AND u.email <> 'x18') OR (u.id = 19 AND u.email <> 'x19') OR (u.id = 20 AND u.email <> 'x20') OR (u.id = 21 AND u.email <> 'x21') OR (u.id = 22 AND u.email <> 'x22') OR (u.id = 23 AND u.email <> 'x23') OR (u.id = 24 AND u.email <> 'x24') OR (u.id = 25 AND u.email <> 'x25') OR (u.id = 26 AND u.email <> 'x26') OR (u.id = 27 AND u.email <> 'x27') OR (u.id = 28 AND u.email <> 'x28') OR (u.id = 29 AND u.email <> 'x29') OR (u.id = 30 AND u.email <> 'x30') OR (u.id = 31 AND u.email <> 'x31') OR (u.id = 32 AND u.email <> 'x32') OR (u.id = 33 AND u.email <> 'x33') OR (u.id = 34 AND u.email <> 'x34') OR (u.id = 35 AND u.email <> 'x35') OR (u.id = 36 AND u.email <> 'x36') OR (u.id = 37 AND u.email <> 'x37') OR (u.id = 38 AND u.email <> 'x38') OR (u.id = 39 AND u.email <> 'x39') OR (u.id = 40 AND u.email <> 'x40') OR (u.id = 41 AND u.email <> 'x41') OR (u.id = 42 AND u.email <> 'x42') OR (u.id = 43 AND u.email <> 'x43') OR (u.id = 44 AND u.email <> 'x44') OR (u.id = 45 AND u.email <> 'x45') OR (u.id = 46 AND u.email <> 'x46') OR (u.id = 47 AND u.email <> 'x47') OR (u.id = 48 AND u.email <> 'x48') OR (u.id = 49 AND u.email <> 'x49') OR (u.id = 50 AND u.email <> 'x50') OR (u.id = 51 AND u.email <> 'x51') OR (u.id = 52 AND u.email <> 'x52') OR (u.id = 53 AND u.email <> 'x53') OR (u.id = 54 AND u.email <> 'x54') OR (u.id = 55 AND u.email <> 'x55') OR (u.id = 56 AND u.email <> 'x56') OR (u.id = 57 AND u.email <> 'x57') OR (u.id = 58 AND u.email <> 'x58') OR (u.id = 59 AND u.email <> 'x59') OR (u.id = 60 AND u.email <> 'x60') OR (u.id = 61 AND u.email <> 'x61') OR (u.id = 62 AND u.email <> 'x62') OR (u.id = 63 AND u.email <> 'x63') OR (u.id = 64 AND u.email <> 'x64') OR (u.id = 65 AND u.email <> 'x65') OR (u.id = 66 AND u.email <> 'x66') OR (u.id = 67 AND u.email <> 'x67') OR (u.id = 68 AND u.email <> 'x68') OR (u.id = 69 AND u.email <> 'x69') OR (u.id = 70 AND u.email <> 'x70') OR (u.id = 71 AND u.email <> 'x71') OR (u.id = 72 AND u.email <> 'x72') OR (u.id = 73 AND u.email <> 'x73') OR (u.id = 74 AND u.email <> 'x74') OR (u.id = 75 AND u.email <> 'x75') OR (u.id = 76 AND u.email <> 'x76') OR (u.id = 77 AND u.email <> 'x77') OR (u.id = 78 AND u.email <> 'x78') OR (u.id = 79 AND u.email <> 'x79') OR (u.id = 80 AND u.email <> 'x80') OR (u.id = 81 AND u.email <> 'x81') OR (u.id = 82 AND u.email <> 'x82') OR (u.id = 83 AND u.email <> 'x83') OR (u.id = 84 AND u.email <> 'x84') OR (u.id = 85 AND u.email <> 'x85') OR (u.id = 86 AND u.email <> 'x86') OR (u.id = 87 AND u.email <> 'x87') OR (u.id = 88 AND u.email <> 'x88') OR (u.id = 89 AND u.email <> 'x89') OR (u.id = 90 AND u.email <> 'x90') OR (u.id = 91 AND u.email <> 'x91') OR (u.id = 92 AND u.email <> 'x92') OR (u.id = 93 AND u.email <> 'x93') OR (u.id = 94 AND u.email <> 'x94') OR (u.id = 95 AND u.email <> 'x95') OR (u.id = 96 AND u.email <> 'x96') OR (u.id = 97 AND u.email <> 'x97') OR (u.id = 98 AND u.email <> 'x98') OR (u.id = 99 AND u.email <> 'x99') OR (u.id = 100 AND u.email <> 'x100') OR (u.id = 101 AND u.email <> 'x101') OR (u.id = 102 AND u.email <> 'x102') OR (u.id = 103 AND u.email <> 'x103') OR (u.id = 104 AND u.email <> 'x104') OR (u.id = 105 AND u.email <> 'x105') OR (u.id = 106 AND u.email <> 'x106') OR (u.id = 107 AND u.email <> 'x107') OR (u.id = 108 AND u.email <> 'x108') OR (u.id = 109 AND u.email <> 'x109') OR (u.id = 110 AND u.email <> 'x110') OR (u.id = 111 AND u.email <> 'x111') OR (u.id = 112 AND u.email <> 'x112') OR (u.id = 113 AND u.email <> 'x113') OR (u.id = 114 AND u.email <> 'x114') OR (u.id = 115 AND u.email <> 'x115') OR (u.id = 116 AND u.email <> 'x116') OR (u.id = 117 AND u.email <> 'x117') OR (u.id = 118 AND u.email <> 'x118') OR (u.id = 119 AND u.email <> 'x119')">
	>().toEqualTypeOf<"SELECT u.id FROM users u WHERE (u.id = 0 AND u.email <> 'x0') OR (u.id = 1 AND u.email <> 'x1') OR (u.id = 2 AND u.email <> 'x2') OR (u.id = 3 AND u.email <> 'x3') OR (u.id = 4 AND u.email <> 'x4') OR (u.id = 5 AND u.email <> 'x5') OR (u.id = 6 AND u.email <> 'x6') OR (u.id = 7 AND u.email <> 'x7') OR (u.id = 8 AND u.email <> 'x8') OR (u.id = 9 AND u.email <> 'x9') OR (u.id = 10 AND u.email <> 'x10') OR (u.id = 11 AND u.email <> 'x11') OR (u.id = 12 AND u.email <> 'x12') OR (u.id = 13 AND u.email <> 'x13') OR (u.id = 14 AND u.email <> 'x14') OR (u.id = 15 AND u.email <> 'x15') OR (u.id = 16 AND u.email <> 'x16') OR (u.id = 17 AND u.email <> 'x17') OR (u.id = 18 AND u.email <> 'x18') OR (u.id = 19 AND u.email <> 'x19') OR (u.id = 20 AND u.email <> 'x20') OR (u.id = 21 AND u.email <> 'x21') OR (u.id = 22 AND u.email <> 'x22') OR (u.id = 23 AND u.email <> 'x23') OR (u.id = 24 AND u.email <> 'x24') OR (u.id = 25 AND u.email <> 'x25') OR (u.id = 26 AND u.email <> 'x26') OR (u.id = 27 AND u.email <> 'x27') OR (u.id = 28 AND u.email <> 'x28') OR (u.id = 29 AND u.email <> 'x29') OR (u.id = 30 AND u.email <> 'x30') OR (u.id = 31 AND u.email <> 'x31') OR (u.id = 32 AND u.email <> 'x32') OR (u.id = 33 AND u.email <> 'x33') OR (u.id = 34 AND u.email <> 'x34') OR (u.id = 35 AND u.email <> 'x35') OR (u.id = 36 AND u.email <> 'x36') OR (u.id = 37 AND u.email <> 'x37') OR (u.id = 38 AND u.email <> 'x38') OR (u.id = 39 AND u.email <> 'x39') OR (u.id = 40 AND u.email <> 'x40') OR (u.id = 41 AND u.email <> 'x41') OR (u.id = 42 AND u.email <> 'x42') OR (u.id = 43 AND u.email <> 'x43') OR (u.id = 44 AND u.email <> 'x44') OR (u.id = 45 AND u.email <> 'x45') OR (u.id = 46 AND u.email <> 'x46') OR (u.id = 47 AND u.email <> 'x47') OR (u.id = 48 AND u.email <> 'x48') OR (u.id = 49 AND u.email <> 'x49') OR (u.id = 50 AND u.email <> 'x50') OR (u.id = 51 AND u.email <> 'x51') OR (u.id = 52 AND u.email <> 'x52') OR (u.id = 53 AND u.email <> 'x53') OR (u.id = 54 AND u.email <> 'x54') OR (u.id = 55 AND u.email <> 'x55') OR (u.id = 56 AND u.email <> 'x56') OR (u.id = 57 AND u.email <> 'x57') OR (u.id = 58 AND u.email <> 'x58') OR (u.id = 59 AND u.email <> 'x59') OR (u.id = 60 AND u.email <> 'x60') OR (u.id = 61 AND u.email <> 'x61') OR (u.id = 62 AND u.email <> 'x62') OR (u.id = 63 AND u.email <> 'x63') OR (u.id = 64 AND u.email <> 'x64') OR (u.id = 65 AND u.email <> 'x65') OR (u.id = 66 AND u.email <> 'x66') OR (u.id = 67 AND u.email <> 'x67') OR (u.id = 68 AND u.email <> 'x68') OR (u.id = 69 AND u.email <> 'x69') OR (u.id = 70 AND u.email <> 'x70') OR (u.id = 71 AND u.email <> 'x71') OR (u.id = 72 AND u.email <> 'x72') OR (u.id = 73 AND u.email <> 'x73') OR (u.id = 74 AND u.email <> 'x74') OR (u.id = 75 AND u.email <> 'x75') OR (u.id = 76 AND u.email <> 'x76') OR (u.id = 77 AND u.email <> 'x77') OR (u.id = 78 AND u.email <> 'x78') OR (u.id = 79 AND u.email <> 'x79') OR (u.id = 80 AND u.email <> 'x80') OR (u.id = 81 AND u.email <> 'x81') OR (u.id = 82 AND u.email <> 'x82') OR (u.id = 83 AND u.email <> 'x83') OR (u.id = 84 AND u.email <> 'x84') OR (u.id = 85 AND u.email <> 'x85') OR (u.id = 86 AND u.email <> 'x86') OR (u.id = 87 AND u.email <> 'x87') OR (u.id = 88 AND u.email <> 'x88') OR (u.id = 89 AND u.email <> 'x89') OR (u.id = 90 AND u.email <> 'x90') OR (u.id = 91 AND u.email <> 'x91') OR (u.id = 92 AND u.email <> 'x92') OR (u.id = 93 AND u.email <> 'x93') OR (u.id = 94 AND u.email <> 'x94') OR (u.id = 95 AND u.email <> 'x95') OR (u.id = 96 AND u.email <> 'x96') OR (u.id = 97 AND u.email <> 'x97') OR (u.id = 98 AND u.email <> 'x98') OR (u.id = 99 AND u.email <> 'x99') OR (u.id = 100 AND u.email <> 'x100') OR (u.id = 101 AND u.email <> 'x101') OR (u.id = 102 AND u.email <> 'x102') OR (u.id = 103 AND u.email <> 'x103') OR (u.id = 104 AND u.email <> 'x104') OR (u.id = 105 AND u.email <> 'x105') OR (u.id = 106 AND u.email <> 'x106') OR (u.id = 107 AND u.email <> 'x107') OR (u.id = 108 AND u.email <> 'x108') OR (u.id = 109 AND u.email <> 'x109') OR (u.id = 110 AND u.email <> 'x110') OR (u.id = 111 AND u.email <> 'x111') OR (u.id = 112 AND u.email <> 'x112') OR (u.id = 113 AND u.email <> 'x113') OR (u.id = 114 AND u.email <> 'x114') OR (u.id = 115 AND u.email <> 'x115') OR (u.id = 116 AND u.email <> 'x116') OR (u.id = 117 AND u.email <> 'x117') OR (u.id = 118 AND u.email <> 'x118') OR (u.id = 119 AND u.email <> 'x119')">();
	// 3392 bytes
	expectTypeOf<
		Row<"SELECT id FROM users WHERE (id = 0 OR (email = 'a0' AND (display_name IS NULL OR display_name <> 'b0'))) AND (id = 1 OR (email = 'a1' AND (display_name IS NULL OR display_name <> 'b1'))) AND (id = 2 OR (email = 'a2' AND (display_name IS NULL OR display_name <> 'b2'))) AND (id = 3 OR (email = 'a3' AND (display_name IS NULL OR display_name <> 'b3'))) AND (id = 4 OR (email = 'a4' AND (display_name IS NULL OR display_name <> 'b4'))) AND (id = 5 OR (email = 'a5' AND (display_name IS NULL OR display_name <> 'b5'))) AND (id = 6 OR (email = 'a6' AND (display_name IS NULL OR display_name <> 'b6'))) AND (id = 7 OR (email = 'a7' AND (display_name IS NULL OR display_name <> 'b7'))) AND (id = 8 OR (email = 'a8' AND (display_name IS NULL OR display_name <> 'b8'))) AND (id = 9 OR (email = 'a9' AND (display_name IS NULL OR display_name <> 'b9'))) AND (id = 10 OR (email = 'a10' AND (display_name IS NULL OR display_name <> 'b10'))) AND (id = 11 OR (email = 'a11' AND (display_name IS NULL OR display_name <> 'b11'))) AND (id = 12 OR (email = 'a12' AND (display_name IS NULL OR display_name <> 'b12'))) AND (id = 13 OR (email = 'a13' AND (display_name IS NULL OR display_name <> 'b13'))) AND (id = 14 OR (email = 'a14' AND (display_name IS NULL OR display_name <> 'b14'))) AND (id = 15 OR (email = 'a15' AND (display_name IS NULL OR display_name <> 'b15'))) AND (id = 16 OR (email = 'a16' AND (display_name IS NULL OR display_name <> 'b16'))) AND (id = 17 OR (email = 'a17' AND (display_name IS NULL OR display_name <> 'b17'))) AND (id = 18 OR (email = 'a18' AND (display_name IS NULL OR display_name <> 'b18'))) AND (id = 19 OR (email = 'a19' AND (display_name IS NULL OR display_name <> 'b19'))) AND (id = 20 OR (email = 'a20' AND (display_name IS NULL OR display_name <> 'b20'))) AND (id = 21 OR (email = 'a21' AND (display_name IS NULL OR display_name <> 'b21'))) AND (id = 22 OR (email = 'a22' AND (display_name IS NULL OR display_name <> 'b22'))) AND (id = 23 OR (email = 'a23' AND (display_name IS NULL OR display_name <> 'b23'))) AND (id = 24 OR (email = 'a24' AND (display_name IS NULL OR display_name <> 'b24'))) AND (id = 25 OR (email = 'a25' AND (display_name IS NULL OR display_name <> 'b25'))) AND (id = 26 OR (email = 'a26' AND (display_name IS NULL OR display_name <> 'b26'))) AND (id = 27 OR (email = 'a27' AND (display_name IS NULL OR display_name <> 'b27'))) AND (id = 28 OR (email = 'a28' AND (display_name IS NULL OR display_name <> 'b28'))) AND (id = 29 OR (email = 'a29' AND (display_name IS NULL OR display_name <> 'b29'))) AND (id = 30 OR (email = 'a30' AND (display_name IS NULL OR display_name <> 'b30'))) AND (id = 31 OR (email = 'a31' AND (display_name IS NULL OR display_name <> 'b31'))) AND (id = 32 OR (email = 'a32' AND (display_name IS NULL OR display_name <> 'b32'))) AND (id = 33 OR (email = 'a33' AND (display_name IS NULL OR display_name <> 'b33'))) AND (id = 34 OR (email = 'a34' AND (display_name IS NULL OR display_name <> 'b34'))) AND (id = 35 OR (email = 'a35' AND (display_name IS NULL OR display_name <> 'b35'))) AND (id = 36 OR (email = 'a36' AND (display_name IS NULL OR display_name <> 'b36'))) AND (id = 37 OR (email = 'a37' AND (display_name IS NULL OR display_name <> 'b37'))) AND (id = 38 OR (email = 'a38' AND (display_name IS NULL OR display_name <> 'b38'))) AND (id = 39 OR (email = 'a39' AND (display_name IS NULL OR display_name <> 'b39')))">
	>().toEqualTypeOf<{ id: number }>();
});

test("40 parameters, a 300-element IN list, a 100-branch CASE", () => {
	expectTypeOf<
		Params<"SELECT id FROM users WHERE id = $1 OR id = $2 OR id = $3 OR id = $4 OR id = $5 OR id = $6 OR id = $7 OR id = $8 OR id = $9 OR id = $10 OR id = $11 OR id = $12 OR id = $13 OR id = $14 OR id = $15 OR id = $16 OR id = $17 OR id = $18 OR id = $19 OR id = $20 OR id = $21 OR id = $22 OR id = $23 OR id = $24 OR id = $25 OR id = $26 OR id = $27 OR id = $28 OR id = $29 OR id = $30 OR id = $31 OR id = $32 OR id = $33 OR id = $34 OR id = $35 OR id = $36 OR id = $37 OR id = $38 OR id = $39 OR id = $40">
	>().toEqualTypeOf<
		[
			number | null,
			number | null,
			number | null,
			number | null,
			number | null,
			number | null,
			number | null,
			number | null,
			number | null,
			number | null,
			number | null,
			number | null,
			number | null,
			number | null,
			number | null,
			number | null,
			number | null,
			number | null,
			number | null,
			number | null,
			number | null,
			number | null,
			number | null,
			number | null,
			number | null,
			number | null,
			number | null,
			number | null,
			number | null,
			number | null,
			number | null,
			number | null,
			number | null,
			number | null,
			number | null,
			number | null,
			number | null,
			number | null,
			number | null,
			number | null,
		]
	>();
	expectTypeOf<
		Row<"SELECT id FROM users WHERE id IN (0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 60, 61, 62, 63, 64, 65, 66, 67, 68, 69, 70, 71, 72, 73, 74, 75, 76, 77, 78, 79, 80, 81, 82, 83, 84, 85, 86, 87, 88, 89, 90, 91, 92, 93, 94, 95, 96, 97, 98, 99, 100, 101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111, 112, 113, 114, 115, 116, 117, 118, 119, 120, 121, 122, 123, 124, 125, 126, 127, 128, 129, 130, 131, 132, 133, 134, 135, 136, 137, 138, 139, 140, 141, 142, 143, 144, 145, 146, 147, 148, 149, 150, 151, 152, 153, 154, 155, 156, 157, 158, 159, 160, 161, 162, 163, 164, 165, 166, 167, 168, 169, 170, 171, 172, 173, 174, 175, 176, 177, 178, 179, 180, 181, 182, 183, 184, 185, 186, 187, 188, 189, 190, 191, 192, 193, 194, 195, 196, 197, 198, 199, 200, 201, 202, 203, 204, 205, 206, 207, 208, 209, 210, 211, 212, 213, 214, 215, 216, 217, 218, 219, 220, 221, 222, 223, 224, 225, 226, 227, 228, 229, 230, 231, 232, 233, 234, 235, 236, 237, 238, 239, 240, 241, 242, 243, 244, 245, 246, 247, 248, 249, 250, 251, 252, 253, 254, 255, 256, 257, 258, 259, 260, 261, 262, 263, 264, 265, 266, 267, 268, 269, 270, 271, 272, 273, 274, 275, 276, 277, 278, 279, 280, 281, 282, 283, 284, 285, 286, 287, 288, 289, 290, 291, 292, 293, 294, 295, 296, 297, 298, 299)">
	>().toEqualTypeOf<{ id: number }>();
	expectTypeOf<
		Row<"SELECT CASE WHEN id = 0 THEN 'v0' WHEN id = 1 THEN 'v1' WHEN id = 2 THEN 'v2' WHEN id = 3 THEN 'v3' WHEN id = 4 THEN 'v4' WHEN id = 5 THEN 'v5' WHEN id = 6 THEN 'v6' WHEN id = 7 THEN 'v7' WHEN id = 8 THEN 'v8' WHEN id = 9 THEN 'v9' WHEN id = 10 THEN 'v10' WHEN id = 11 THEN 'v11' WHEN id = 12 THEN 'v12' WHEN id = 13 THEN 'v13' WHEN id = 14 THEN 'v14' WHEN id = 15 THEN 'v15' WHEN id = 16 THEN 'v16' WHEN id = 17 THEN 'v17' WHEN id = 18 THEN 'v18' WHEN id = 19 THEN 'v19' WHEN id = 20 THEN 'v20' WHEN id = 21 THEN 'v21' WHEN id = 22 THEN 'v22' WHEN id = 23 THEN 'v23' WHEN id = 24 THEN 'v24' WHEN id = 25 THEN 'v25' WHEN id = 26 THEN 'v26' WHEN id = 27 THEN 'v27' WHEN id = 28 THEN 'v28' WHEN id = 29 THEN 'v29' WHEN id = 30 THEN 'v30' WHEN id = 31 THEN 'v31' WHEN id = 32 THEN 'v32' WHEN id = 33 THEN 'v33' WHEN id = 34 THEN 'v34' WHEN id = 35 THEN 'v35' WHEN id = 36 THEN 'v36' WHEN id = 37 THEN 'v37' WHEN id = 38 THEN 'v38' WHEN id = 39 THEN 'v39' WHEN id = 40 THEN 'v40' WHEN id = 41 THEN 'v41' WHEN id = 42 THEN 'v42' WHEN id = 43 THEN 'v43' WHEN id = 44 THEN 'v44' WHEN id = 45 THEN 'v45' WHEN id = 46 THEN 'v46' WHEN id = 47 THEN 'v47' WHEN id = 48 THEN 'v48' WHEN id = 49 THEN 'v49' WHEN id = 50 THEN 'v50' WHEN id = 51 THEN 'v51' WHEN id = 52 THEN 'v52' WHEN id = 53 THEN 'v53' WHEN id = 54 THEN 'v54' WHEN id = 55 THEN 'v55' WHEN id = 56 THEN 'v56' WHEN id = 57 THEN 'v57' WHEN id = 58 THEN 'v58' WHEN id = 59 THEN 'v59' WHEN id = 60 THEN 'v60' WHEN id = 61 THEN 'v61' WHEN id = 62 THEN 'v62' WHEN id = 63 THEN 'v63' WHEN id = 64 THEN 'v64' WHEN id = 65 THEN 'v65' WHEN id = 66 THEN 'v66' WHEN id = 67 THEN 'v67' WHEN id = 68 THEN 'v68' WHEN id = 69 THEN 'v69' WHEN id = 70 THEN 'v70' WHEN id = 71 THEN 'v71' WHEN id = 72 THEN 'v72' WHEN id = 73 THEN 'v73' WHEN id = 74 THEN 'v74' WHEN id = 75 THEN 'v75' WHEN id = 76 THEN 'v76' WHEN id = 77 THEN 'v77' WHEN id = 78 THEN 'v78' WHEN id = 79 THEN 'v79' WHEN id = 80 THEN 'v80' WHEN id = 81 THEN 'v81' WHEN id = 82 THEN 'v82' WHEN id = 83 THEN 'v83' WHEN id = 84 THEN 'v84' WHEN id = 85 THEN 'v85' WHEN id = 86 THEN 'v86' WHEN id = 87 THEN 'v87' WHEN id = 88 THEN 'v88' WHEN id = 89 THEN 'v89' WHEN id = 90 THEN 'v90' WHEN id = 91 THEN 'v91' WHEN id = 92 THEN 'v92' WHEN id = 93 THEN 'v93' WHEN id = 94 THEN 'v94' WHEN id = 95 THEN 'v95' WHEN id = 96 THEN 'v96' WHEN id = 97 THEN 'v97' WHEN id = 98 THEN 'v98' WHEN id = 99 THEN 'v99' ELSE 'z' END AS x FROM users">
	>().toEqualTypeOf<{ x: string }>();
});

test("left-nested operator chains", () => {
	expectTypeOf<
		Row<"SELECT email || email || email || email || email || email || email || email || email || email || email || email || email || email || email || email || email || email || email || email || email || email || email || email || email || email || email || email || email || email || email || email || email || email || email || email || email || email || email || email || email || email || email || email || email || email || email || email || email || email || email || email || email || email || email || email || email || email || email || email AS x FROM users">
	>().toEqualTypeOf<{ x: string }>();
	expectTypeOf<
		Row<"SELECT id + id + id + id + id + id + id + id + id + id + id + id + id + id + id + id + id + id + id + id + id + id + id + id + id + id + id + id + id + id + id + id + id + id + id + id + id + id + id + id + id + id + id + id + id + id + id + id + id + id AS x FROM users">
	>().toEqualTypeOf<{ x: number }>();
});

test("a 4.6 KB statement: 200 targets, a LEFT JOIN and a 101-term WHERE", () => {
	// 4754 bytes; `p.title IS NOT NULL` narrows the outer-joined column
	expectTypeOf<
		V<"SELECT u.email AS e0, p.title AS t0, u.email AS e1, p.title AS t1, u.email AS e2, p.title AS t2, u.email AS e3, p.title AS t3, u.email AS e4, p.title AS t4, u.email AS e5, p.title AS t5, u.email AS e6, p.title AS t6, u.email AS e7, p.title AS t7, u.email AS e8, p.title AS t8, u.email AS e9, p.title AS t9, u.email AS e10, p.title AS t10, u.email AS e11, p.title AS t11, u.email AS e12, p.title AS t12, u.email AS e13, p.title AS t13, u.email AS e14, p.title AS t14, u.email AS e15, p.title AS t15, u.email AS e16, p.title AS t16, u.email AS e17, p.title AS t17, u.email AS e18, p.title AS t18, u.email AS e19, p.title AS t19, u.email AS e20, p.title AS t20, u.email AS e21, p.title AS t21, u.email AS e22, p.title AS t22, u.email AS e23, p.title AS t23, u.email AS e24, p.title AS t24, u.email AS e25, p.title AS t25, u.email AS e26, p.title AS t26, u.email AS e27, p.title AS t27, u.email AS e28, p.title AS t28, u.email AS e29, p.title AS t29, u.email AS e30, p.title AS t30, u.email AS e31, p.title AS t31, u.email AS e32, p.title AS t32, u.email AS e33, p.title AS t33, u.email AS e34, p.title AS t34, u.email AS e35, p.title AS t35, u.email AS e36, p.title AS t36, u.email AS e37, p.title AS t37, u.email AS e38, p.title AS t38, u.email AS e39, p.title AS t39, u.email AS e40, p.title AS t40, u.email AS e41, p.title AS t41, u.email AS e42, p.title AS t42, u.email AS e43, p.title AS t43, u.email AS e44, p.title AS t44, u.email AS e45, p.title AS t45, u.email AS e46, p.title AS t46, u.email AS e47, p.title AS t47, u.email AS e48, p.title AS t48, u.email AS e49, p.title AS t49, u.email AS e50, p.title AS t50, u.email AS e51, p.title AS t51, u.email AS e52, p.title AS t52, u.email AS e53, p.title AS t53, u.email AS e54, p.title AS t54, u.email AS e55, p.title AS t55, u.email AS e56, p.title AS t56, u.email AS e57, p.title AS t57, u.email AS e58, p.title AS t58, u.email AS e59, p.title AS t59, u.email AS e60, p.title AS t60, u.email AS e61, p.title AS t61, u.email AS e62, p.title AS t62, u.email AS e63, p.title AS t63, u.email AS e64, p.title AS t64, u.email AS e65, p.title AS t65, u.email AS e66, p.title AS t66, u.email AS e67, p.title AS t67, u.email AS e68, p.title AS t68, u.email AS e69, p.title AS t69, u.email AS e70, p.title AS t70, u.email AS e71, p.title AS t71, u.email AS e72, p.title AS t72, u.email AS e73, p.title AS t73, u.email AS e74, p.title AS t74, u.email AS e75, p.title AS t75, u.email AS e76, p.title AS t76, u.email AS e77, p.title AS t77, u.email AS e78, p.title AS t78, u.email AS e79, p.title AS t79, u.email AS e80, p.title AS t80, u.email AS e81, p.title AS t81, u.email AS e82, p.title AS t82, u.email AS e83, p.title AS t83, u.email AS e84, p.title AS t84, u.email AS e85, p.title AS t85, u.email AS e86, p.title AS t86, u.email AS e87, p.title AS t87, u.email AS e88, p.title AS t88, u.email AS e89, p.title AS t89, u.email AS e90, p.title AS t90, u.email AS e91, p.title AS t91, u.email AS e92, p.title AS t92, u.email AS e93, p.title AS t93, u.email AS e94, p.title AS t94, u.email AS e95, p.title AS t95, u.email AS e96, p.title AS t96, u.email AS e97, p.title AS t97, u.email AS e98, p.title AS t98, u.email AS e99, p.title AS t99 FROM users u LEFT JOIN posts p ON p.author_id = u.id WHERE u.id <> 0 AND u.id <> 1 AND u.id <> 2 AND u.id <> 3 AND u.id <> 4 AND u.id <> 5 AND u.id <> 6 AND u.id <> 7 AND u.id <> 8 AND u.id <> 9 AND u.id <> 10 AND u.id <> 11 AND u.id <> 12 AND u.id <> 13 AND u.id <> 14 AND u.id <> 15 AND u.id <> 16 AND u.id <> 17 AND u.id <> 18 AND u.id <> 19 AND u.id <> 20 AND u.id <> 21 AND u.id <> 22 AND u.id <> 23 AND u.id <> 24 AND u.id <> 25 AND u.id <> 26 AND u.id <> 27 AND u.id <> 28 AND u.id <> 29 AND u.id <> 30 AND u.id <> 31 AND u.id <> 32 AND u.id <> 33 AND u.id <> 34 AND u.id <> 35 AND u.id <> 36 AND u.id <> 37 AND u.id <> 38 AND u.id <> 39 AND u.id <> 40 AND u.id <> 41 AND u.id <> 42 AND u.id <> 43 AND u.id <> 44 AND u.id <> 45 AND u.id <> 46 AND u.id <> 47 AND u.id <> 48 AND u.id <> 49 AND u.id <> 50 AND u.id <> 51 AND u.id <> 52 AND u.id <> 53 AND u.id <> 54 AND u.id <> 55 AND u.id <> 56 AND u.id <> 57 AND u.id <> 58 AND u.id <> 59 AND u.id <> 60 AND u.id <> 61 AND u.id <> 62 AND u.id <> 63 AND u.id <> 64 AND u.id <> 65 AND u.id <> 66 AND u.id <> 67 AND u.id <> 68 AND u.id <> 69 AND u.id <> 70 AND u.id <> 71 AND u.id <> 72 AND u.id <> 73 AND u.id <> 74 AND u.id <> 75 AND u.id <> 76 AND u.id <> 77 AND u.id <> 78 AND u.id <> 79 AND u.id <> 80 AND u.id <> 81 AND u.id <> 82 AND u.id <> 83 AND u.id <> 84 AND u.id <> 85 AND u.id <> 86 AND u.id <> 87 AND u.id <> 88 AND u.id <> 89 AND u.id <> 90 AND u.id <> 91 AND u.id <> 92 AND u.id <> 93 AND u.id <> 94 AND u.id <> 95 AND u.id <> 96 AND u.id <> 97 AND u.id <> 98 AND u.id <> 99 AND p.title IS NOT NULL">
	>().toEqualTypeOf<"SELECT u.email AS e0, p.title AS t0, u.email AS e1, p.title AS t1, u.email AS e2, p.title AS t2, u.email AS e3, p.title AS t3, u.email AS e4, p.title AS t4, u.email AS e5, p.title AS t5, u.email AS e6, p.title AS t6, u.email AS e7, p.title AS t7, u.email AS e8, p.title AS t8, u.email AS e9, p.title AS t9, u.email AS e10, p.title AS t10, u.email AS e11, p.title AS t11, u.email AS e12, p.title AS t12, u.email AS e13, p.title AS t13, u.email AS e14, p.title AS t14, u.email AS e15, p.title AS t15, u.email AS e16, p.title AS t16, u.email AS e17, p.title AS t17, u.email AS e18, p.title AS t18, u.email AS e19, p.title AS t19, u.email AS e20, p.title AS t20, u.email AS e21, p.title AS t21, u.email AS e22, p.title AS t22, u.email AS e23, p.title AS t23, u.email AS e24, p.title AS t24, u.email AS e25, p.title AS t25, u.email AS e26, p.title AS t26, u.email AS e27, p.title AS t27, u.email AS e28, p.title AS t28, u.email AS e29, p.title AS t29, u.email AS e30, p.title AS t30, u.email AS e31, p.title AS t31, u.email AS e32, p.title AS t32, u.email AS e33, p.title AS t33, u.email AS e34, p.title AS t34, u.email AS e35, p.title AS t35, u.email AS e36, p.title AS t36, u.email AS e37, p.title AS t37, u.email AS e38, p.title AS t38, u.email AS e39, p.title AS t39, u.email AS e40, p.title AS t40, u.email AS e41, p.title AS t41, u.email AS e42, p.title AS t42, u.email AS e43, p.title AS t43, u.email AS e44, p.title AS t44, u.email AS e45, p.title AS t45, u.email AS e46, p.title AS t46, u.email AS e47, p.title AS t47, u.email AS e48, p.title AS t48, u.email AS e49, p.title AS t49, u.email AS e50, p.title AS t50, u.email AS e51, p.title AS t51, u.email AS e52, p.title AS t52, u.email AS e53, p.title AS t53, u.email AS e54, p.title AS t54, u.email AS e55, p.title AS t55, u.email AS e56, p.title AS t56, u.email AS e57, p.title AS t57, u.email AS e58, p.title AS t58, u.email AS e59, p.title AS t59, u.email AS e60, p.title AS t60, u.email AS e61, p.title AS t61, u.email AS e62, p.title AS t62, u.email AS e63, p.title AS t63, u.email AS e64, p.title AS t64, u.email AS e65, p.title AS t65, u.email AS e66, p.title AS t66, u.email AS e67, p.title AS t67, u.email AS e68, p.title AS t68, u.email AS e69, p.title AS t69, u.email AS e70, p.title AS t70, u.email AS e71, p.title AS t71, u.email AS e72, p.title AS t72, u.email AS e73, p.title AS t73, u.email AS e74, p.title AS t74, u.email AS e75, p.title AS t75, u.email AS e76, p.title AS t76, u.email AS e77, p.title AS t77, u.email AS e78, p.title AS t78, u.email AS e79, p.title AS t79, u.email AS e80, p.title AS t80, u.email AS e81, p.title AS t81, u.email AS e82, p.title AS t82, u.email AS e83, p.title AS t83, u.email AS e84, p.title AS t84, u.email AS e85, p.title AS t85, u.email AS e86, p.title AS t86, u.email AS e87, p.title AS t87, u.email AS e88, p.title AS t88, u.email AS e89, p.title AS t89, u.email AS e90, p.title AS t90, u.email AS e91, p.title AS t91, u.email AS e92, p.title AS t92, u.email AS e93, p.title AS t93, u.email AS e94, p.title AS t94, u.email AS e95, p.title AS t95, u.email AS e96, p.title AS t96, u.email AS e97, p.title AS t97, u.email AS e98, p.title AS t98, u.email AS e99, p.title AS t99 FROM users u LEFT JOIN posts p ON p.author_id = u.id WHERE u.id <> 0 AND u.id <> 1 AND u.id <> 2 AND u.id <> 3 AND u.id <> 4 AND u.id <> 5 AND u.id <> 6 AND u.id <> 7 AND u.id <> 8 AND u.id <> 9 AND u.id <> 10 AND u.id <> 11 AND u.id <> 12 AND u.id <> 13 AND u.id <> 14 AND u.id <> 15 AND u.id <> 16 AND u.id <> 17 AND u.id <> 18 AND u.id <> 19 AND u.id <> 20 AND u.id <> 21 AND u.id <> 22 AND u.id <> 23 AND u.id <> 24 AND u.id <> 25 AND u.id <> 26 AND u.id <> 27 AND u.id <> 28 AND u.id <> 29 AND u.id <> 30 AND u.id <> 31 AND u.id <> 32 AND u.id <> 33 AND u.id <> 34 AND u.id <> 35 AND u.id <> 36 AND u.id <> 37 AND u.id <> 38 AND u.id <> 39 AND u.id <> 40 AND u.id <> 41 AND u.id <> 42 AND u.id <> 43 AND u.id <> 44 AND u.id <> 45 AND u.id <> 46 AND u.id <> 47 AND u.id <> 48 AND u.id <> 49 AND u.id <> 50 AND u.id <> 51 AND u.id <> 52 AND u.id <> 53 AND u.id <> 54 AND u.id <> 55 AND u.id <> 56 AND u.id <> 57 AND u.id <> 58 AND u.id <> 59 AND u.id <> 60 AND u.id <> 61 AND u.id <> 62 AND u.id <> 63 AND u.id <> 64 AND u.id <> 65 AND u.id <> 66 AND u.id <> 67 AND u.id <> 68 AND u.id <> 69 AND u.id <> 70 AND u.id <> 71 AND u.id <> 72 AND u.id <> 73 AND u.id <> 74 AND u.id <> 75 AND u.id <> 76 AND u.id <> 77 AND u.id <> 78 AND u.id <> 79 AND u.id <> 80 AND u.id <> 81 AND u.id <> 82 AND u.id <> 83 AND u.id <> 84 AND u.id <> 85 AND u.id <> 86 AND u.id <> 87 AND u.id <> 88 AND u.id <> 89 AND u.id <> 90 AND u.id <> 91 AND u.id <> 92 AND u.id <> 93 AND u.id <> 94 AND u.id <> 95 AND u.id <> 96 AND u.id <> 97 AND u.id <> 98 AND u.id <> 99 AND p.title IS NOT NULL">();
	type Big =
		Row<"SELECT u.email AS e0, p.title AS t0, u.email AS e1, p.title AS t1, u.email AS e2, p.title AS t2, u.email AS e3, p.title AS t3, u.email AS e4, p.title AS t4, u.email AS e5, p.title AS t5, u.email AS e6, p.title AS t6, u.email AS e7, p.title AS t7, u.email AS e8, p.title AS t8, u.email AS e9, p.title AS t9, u.email AS e10, p.title AS t10, u.email AS e11, p.title AS t11, u.email AS e12, p.title AS t12, u.email AS e13, p.title AS t13, u.email AS e14, p.title AS t14, u.email AS e15, p.title AS t15, u.email AS e16, p.title AS t16, u.email AS e17, p.title AS t17, u.email AS e18, p.title AS t18, u.email AS e19, p.title AS t19, u.email AS e20, p.title AS t20, u.email AS e21, p.title AS t21, u.email AS e22, p.title AS t22, u.email AS e23, p.title AS t23, u.email AS e24, p.title AS t24, u.email AS e25, p.title AS t25, u.email AS e26, p.title AS t26, u.email AS e27, p.title AS t27, u.email AS e28, p.title AS t28, u.email AS e29, p.title AS t29, u.email AS e30, p.title AS t30, u.email AS e31, p.title AS t31, u.email AS e32, p.title AS t32, u.email AS e33, p.title AS t33, u.email AS e34, p.title AS t34, u.email AS e35, p.title AS t35, u.email AS e36, p.title AS t36, u.email AS e37, p.title AS t37, u.email AS e38, p.title AS t38, u.email AS e39, p.title AS t39, u.email AS e40, p.title AS t40, u.email AS e41, p.title AS t41, u.email AS e42, p.title AS t42, u.email AS e43, p.title AS t43, u.email AS e44, p.title AS t44, u.email AS e45, p.title AS t45, u.email AS e46, p.title AS t46, u.email AS e47, p.title AS t47, u.email AS e48, p.title AS t48, u.email AS e49, p.title AS t49, u.email AS e50, p.title AS t50, u.email AS e51, p.title AS t51, u.email AS e52, p.title AS t52, u.email AS e53, p.title AS t53, u.email AS e54, p.title AS t54, u.email AS e55, p.title AS t55, u.email AS e56, p.title AS t56, u.email AS e57, p.title AS t57, u.email AS e58, p.title AS t58, u.email AS e59, p.title AS t59, u.email AS e60, p.title AS t60, u.email AS e61, p.title AS t61, u.email AS e62, p.title AS t62, u.email AS e63, p.title AS t63, u.email AS e64, p.title AS t64, u.email AS e65, p.title AS t65, u.email AS e66, p.title AS t66, u.email AS e67, p.title AS t67, u.email AS e68, p.title AS t68, u.email AS e69, p.title AS t69, u.email AS e70, p.title AS t70, u.email AS e71, p.title AS t71, u.email AS e72, p.title AS t72, u.email AS e73, p.title AS t73, u.email AS e74, p.title AS t74, u.email AS e75, p.title AS t75, u.email AS e76, p.title AS t76, u.email AS e77, p.title AS t77, u.email AS e78, p.title AS t78, u.email AS e79, p.title AS t79, u.email AS e80, p.title AS t80, u.email AS e81, p.title AS t81, u.email AS e82, p.title AS t82, u.email AS e83, p.title AS t83, u.email AS e84, p.title AS t84, u.email AS e85, p.title AS t85, u.email AS e86, p.title AS t86, u.email AS e87, p.title AS t87, u.email AS e88, p.title AS t88, u.email AS e89, p.title AS t89, u.email AS e90, p.title AS t90, u.email AS e91, p.title AS t91, u.email AS e92, p.title AS t92, u.email AS e93, p.title AS t93, u.email AS e94, p.title AS t94, u.email AS e95, p.title AS t95, u.email AS e96, p.title AS t96, u.email AS e97, p.title AS t97, u.email AS e98, p.title AS t98, u.email AS e99, p.title AS t99 FROM users u LEFT JOIN posts p ON p.author_id = u.id WHERE u.id <> 0 AND u.id <> 1 AND u.id <> 2 AND u.id <> 3 AND u.id <> 4 AND u.id <> 5 AND u.id <> 6 AND u.id <> 7 AND u.id <> 8 AND u.id <> 9 AND u.id <> 10 AND u.id <> 11 AND u.id <> 12 AND u.id <> 13 AND u.id <> 14 AND u.id <> 15 AND u.id <> 16 AND u.id <> 17 AND u.id <> 18 AND u.id <> 19 AND u.id <> 20 AND u.id <> 21 AND u.id <> 22 AND u.id <> 23 AND u.id <> 24 AND u.id <> 25 AND u.id <> 26 AND u.id <> 27 AND u.id <> 28 AND u.id <> 29 AND u.id <> 30 AND u.id <> 31 AND u.id <> 32 AND u.id <> 33 AND u.id <> 34 AND u.id <> 35 AND u.id <> 36 AND u.id <> 37 AND u.id <> 38 AND u.id <> 39 AND u.id <> 40 AND u.id <> 41 AND u.id <> 42 AND u.id <> 43 AND u.id <> 44 AND u.id <> 45 AND u.id <> 46 AND u.id <> 47 AND u.id <> 48 AND u.id <> 49 AND u.id <> 50 AND u.id <> 51 AND u.id <> 52 AND u.id <> 53 AND u.id <> 54 AND u.id <> 55 AND u.id <> 56 AND u.id <> 57 AND u.id <> 58 AND u.id <> 59 AND u.id <> 60 AND u.id <> 61 AND u.id <> 62 AND u.id <> 63 AND u.id <> 64 AND u.id <> 65 AND u.id <> 66 AND u.id <> 67 AND u.id <> 68 AND u.id <> 69 AND u.id <> 70 AND u.id <> 71 AND u.id <> 72 AND u.id <> 73 AND u.id <> 74 AND u.id <> 75 AND u.id <> 76 AND u.id <> 77 AND u.id <> 78 AND u.id <> 79 AND u.id <> 80 AND u.id <> 81 AND u.id <> 82 AND u.id <> 83 AND u.id <> 84 AND u.id <> 85 AND u.id <> 86 AND u.id <> 87 AND u.id <> 88 AND u.id <> 89 AND u.id <> 90 AND u.id <> 91 AND u.id <> 92 AND u.id <> 93 AND u.id <> 94 AND u.id <> 95 AND u.id <> 96 AND u.id <> 97 AND u.id <> 98 AND u.id <> 99 AND p.title IS NOT NULL">;
	expectTypeOf<
		Big["e0"] | Big["e99"] | Big["t0"] | Big["t99"]
	>().toEqualTypeOf<string>();
	expectTypeOf<keyof Big>().toEqualTypeOf<
		| "e0"
		| "t0"
		| "e1"
		| "t1"
		| "e2"
		| "t2"
		| "e3"
		| "t3"
		| "e4"
		| "t4"
		| "e5"
		| "t5"
		| "e6"
		| "t6"
		| "e7"
		| "t7"
		| "e8"
		| "t8"
		| "e9"
		| "t9"
		| "e10"
		| "t10"
		| "e11"
		| "t11"
		| "e12"
		| "t12"
		| "e13"
		| "t13"
		| "e14"
		| "t14"
		| "e15"
		| "t15"
		| "e16"
		| "t16"
		| "e17"
		| "t17"
		| "e18"
		| "t18"
		| "e19"
		| "t19"
		| "e20"
		| "t20"
		| "e21"
		| "t21"
		| "e22"
		| "t22"
		| "e23"
		| "t23"
		| "e24"
		| "t24"
		| "e25"
		| "t25"
		| "e26"
		| "t26"
		| "e27"
		| "t27"
		| "e28"
		| "t28"
		| "e29"
		| "t29"
		| "e30"
		| "t30"
		| "e31"
		| "t31"
		| "e32"
		| "t32"
		| "e33"
		| "t33"
		| "e34"
		| "t34"
		| "e35"
		| "t35"
		| "e36"
		| "t36"
		| "e37"
		| "t37"
		| "e38"
		| "t38"
		| "e39"
		| "t39"
		| "e40"
		| "t40"
		| "e41"
		| "t41"
		| "e42"
		| "t42"
		| "e43"
		| "t43"
		| "e44"
		| "t44"
		| "e45"
		| "t45"
		| "e46"
		| "t46"
		| "e47"
		| "t47"
		| "e48"
		| "t48"
		| "e49"
		| "t49"
		| "e50"
		| "t50"
		| "e51"
		| "t51"
		| "e52"
		| "t52"
		| "e53"
		| "t53"
		| "e54"
		| "t54"
		| "e55"
		| "t55"
		| "e56"
		| "t56"
		| "e57"
		| "t57"
		| "e58"
		| "t58"
		| "e59"
		| "t59"
		| "e60"
		| "t60"
		| "e61"
		| "t61"
		| "e62"
		| "t62"
		| "e63"
		| "t63"
		| "e64"
		| "t64"
		| "e65"
		| "t65"
		| "e66"
		| "t66"
		| "e67"
		| "t67"
		| "e68"
		| "t68"
		| "e69"
		| "t69"
		| "e70"
		| "t70"
		| "e71"
		| "t71"
		| "e72"
		| "t72"
		| "e73"
		| "t73"
		| "e74"
		| "t74"
		| "e75"
		| "t75"
		| "e76"
		| "t76"
		| "e77"
		| "t77"
		| "e78"
		| "t78"
		| "e79"
		| "t79"
		| "e80"
		| "t80"
		| "e81"
		| "t81"
		| "e82"
		| "t82"
		| "e83"
		| "t83"
		| "e84"
		| "t84"
		| "e85"
		| "t85"
		| "e86"
		| "t86"
		| "e87"
		| "t87"
		| "e88"
		| "t88"
		| "e89"
		| "t89"
		| "e90"
		| "t90"
		| "e91"
		| "t91"
		| "e92"
		| "t92"
		| "e93"
		| "t93"
		| "e94"
		| "t94"
		| "e95"
		| "t95"
		| "e96"
		| "t96"
		| "e97"
		| "t97"
		| "e98"
		| "t98"
		| "e99"
		| "t99"
	>();
});
