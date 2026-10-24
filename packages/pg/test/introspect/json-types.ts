/** TS types of the JSON columns of the introspection fixture (`config.columnTypes`). */
export interface HistoryItem {
	readonly at: string;
	readonly value: number;
}

export interface Settings {
	readonly theme: "light" | "dark";
}
