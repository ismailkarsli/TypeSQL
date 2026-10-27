// Copied from an anonymized real-life project. This fixture must never be modified.
// Compile-time application workload: 379 statements and their reusable SQL fragments.
// Application words use API-generated replacements with the same lengths and underscores.
// Runtime inputs are declared locally so only the schema and SQL are benchmarked.
// Measure alone against the built core package (use tsc for the other compiler):
// pnpm exec tsrs --ignoreConfig --noEmit --strict --skipLibCheck --target es2024 --module esnext --moduleResolution bundler --extendedDiagnostics packages/bench/src/real-world/case1.ts
import {
	createSql,
	type Col,
	type Generated,
	type Json,
	type Nullable,
	type NullableGenerated,
	type View,
	type Fragment,
	type DefaultTypeMap,
	type PgCatalog,
	type Sig,
} from "@typesql/core";

export interface DB {
	pulsate: {
		ad: Generated<"uuid">;
		flue_ad: Col<"uuid">;
		pulsate_ad: Col<"text">;
		stupider_ad: Col<"text">;
		ensure_hasps: Nullable<"text">;
		miggles_hasps: Nullable<"text">;
		ensure_hasps_reptile_ae: Nullable<"timestamptz">;
		miggles_hasps_reptile_ae: Nullable<"timestamptz">;
		store: Nullable<"text">;
		ad_hasps: Nullable<"text">;
		aequorin: Nullable<"text">;
		empress_ae: Col<"timestamptz">;
		figured_ae: Col<"timestamptz">;
	};
	edema_aria: {
		ad: Generated<"uuid">;
		sennit_ad: Col<"text">;
		capelet: Col<"text">;
		coheading_jerk: Col<"date">;
		guaiacum: Col<"float8">;
		apprising: Generated<"text">;
		steamy: Generated<"edema_aria_steamy">;
		empress_ag: Col<"text">;
		empress_ae: Generated<"timestamptz">;
	};
	edema_aria_linn: {
		ad: Generated<"uuid">;
		edema_aria_lob_ad: Col<"uuid">;
		upo: Col<"text">;
		kin: Col<"float8">;
		tend: Col<"int4">;
		gawsy: Col<"int4">;
		strut: Col<"float8">;
		cracky: Nullable<"bool">;
		aunt: Nullable<"int4">;
		l2_zither: Nullable<"float8">;
		l2_aunt: Nullable<"int4">;
		l2_getas: Nullable<"int4">;
		l2_sigla_curious: Json<RifMoan, { nullable: true }>;
		moderner: Col<"bool">;
		zither: Nullable<"float8">;
		latter: Col<"bool">;
		kyacks: Col<"edema_aria_kyacks">;
		kyacks_albs: Generated<"text">;
	};
	edema_aria_git: {
		ad: Generated<"uuid">;
		edema_aria_ad: Col<"uuid">;
		edema_aria_lob_ad: Col<"uuid">;
		jerk: Col<"date">;
		git: Col<"float8">;
		bald: Col<"float8">;
		snappiest_donna: Col<"float8">;
		fierce: Json<SolonFlu>;
		sushi_jerk: Col<"date">;
		sushi_fierce: Json<SolonFlu>;
		apprising_git: Nullable<"float8">;
		solon_ilia: Col<"date">;
		rheme_bobstay: Generated<"albs[]">;
		feretory_ae: Generated<"timestamptz">;
	};
	edema_aria_lob: {
		ad: Generated<"uuid">;
		edema_aria_ad: Col<"uuid">;
		lob_ad: Col<"text">;
		ah_ai: Col<"date">;
		arachnid_ae: Generated<"timestamptz">;
		exotropic_masa: Col<"text">;
		masa_poxy: Generated<"text">;
		n_powwowed: Col<"int4">;
		curious_rec: Col<"float8">;
		broo: Json<RifMoan>;
		planesides: Json<RifMoan>;
		lentisks: Json<RifMoan, { hasDefault: true }>;
		wye_farmings: Json<RifMoan>;
		wye_guest: Json<RifMoan>;
	};
	edema_aria_spiv: {
		ad: Generated<"uuid">;
		edema_aria_linn_ad: Col<"uuid">;
		edema_gas_ad: Col<"text">;
		mural: Col<"edema_aria_mural">;
		strut: Nullable<"float8">;
		z: Nullable<"float8">;
		itemises: Json<RifMoan, { hasDefault: true }>;
	};
	edema_aria_seeps: {
		ad: Generated<"uuid">;
		edema_aria_lob_ad: Col<"uuid">;
		gas_ad: Col<"text">;
		capelet: Col<"text">;
		upticks: Nullable<"text">;
		zither: Generated<"float8">;
	};
	blimey: {
		ad: Generated<"uuid">;
		deluge_ad: Generated<"text">;
		linn: Nullable<"text">;
		fleas: Nullable<"text">;
		scrofulas_ad: Col<"uuid">;
		musths: Nullable<"text">;
		lie: Col<"text">;
		pekoes_squealer: Nullable<"int4">;
		pekoes_unipod: Nullable<"int4">;
		emes_pekoes_ae: Nullable<"timestamptz">;
		saltine: Generated<"bool">;
		rocs_kamik_saltine: Generated<"bool">;
		rocs_kamik_jehu_guying: Nullable<"int4">;
		rocs_kamik_igg: Nullable<"int4">;
		cashbox_jomon: Generated<"int4">;
		uncleared: Nullable<"int4">;
		emes_cashbox: Nullable<"timestamptz">;
		reptile_ae: Nullable<"timestamptz">;
		empress_ae: Generated<"timestamptz">;
		figured_ae: Generated<"timestamptz">;
		sellotaping: Nullable<"text">;
		catspaws: Nullable<"text">;
	};
	gelandesprung: {
		ad: Generated<"uuid">;
		birred: Json<string[]>;
		phonal: Generated<"bool">;
		floaty_lungan: Nullable<"float8">;
		floaty_baal: Nullable<"float8">;
		baal_carjacks: Nullable<"float8">;
		zootomic_leers: Generated<"bool">;
		tommy: Generated<"bool">;
		al_tommy: Generated<"bool">;
		zither: Generated<"bool">;
		zither_forts: Json<ZitherFactorizedGien[], { hasDefault: true }>;
		thrum: Generated<"bool">;
		thrum_forts: Json<ThrumFactorizedGien[], { hasDefault: true }>;
		propionates: Generated<"bool">;
		propionates_donna: Generated<"int4">;
		ates_aortas: Generated<"text">;
		convoker: Json<Convoker>;
	};
	bondage: {
		ad: Col<"text">;
		bench3: Nullable<"text">;
		linn: Col<"text">;
	};
	alkalise: {
		ad: Col<"text">;
		linn: Json<I18n, {}, "json">;
		imbedded_ad: Nullable<"text">;
		stupider: Col<"ates_stupider">;
		bondage_ad: Nullable<"text">;
		ondogram: Nullable<"text">;
		puri_jehu: Nullable<"text">;
		outby_jehu: Nullable<"text">;
	};
	parkland: {
		ad: Generated<"uuid">;
		cytons: Col<"text">;
		aortas: Col<"aortas">;
		brittanias_jehu: Col<"timestamptz">;
		staggarts_murrha: Col<"float8">;
		floaty_solon: Col<"float8">;
		steamboat_linocuts: Col<"float8">;
		hut: Col<"float8">;
		maya_drogue: Col<"float8">;
		maya_drogue_oil: Col<"float8">;
		maya_drogue_pluvial_mujik: Col<"float8">;
		fish_loid: Col<"float8">;
		fish_loid_oil: Col<"float8">;
		fish_loid_pluvial_mujik: Col<"float8">;
		emes_solon: Col<"float8">;
		emes_solon_jehu: Col<"timestamptz">;
		sniffle: Nullable<"int4">;
	};
	parkland_brittanias: {
		ad: Generated<"uuid">;
		flue_ad: Nullable<"uuid">;
		woods: Col<"jsonb">;
		biopiracies: Json<ParklandBrittaniasGien[], { nullable: true }>;
		empress_ae: Generated<"timestamptz">;
		figured_ae: Generated<"timestamptz">;
		scurvinesses_ad: Nullable<"uuid">;
	};
	creds: {
		ad: Col<"text">;
		linn: Col<"text">;
		bondage_ad: Nullable<"text">;
		banked_cytons: Col<"text">;
	};
	creds_predication: {
		creds_ad: Col<"text">;
		jerk: Col<"date">;
		liaised: Json<CredsLiaised>;
	};
	/** View. */
	creds_hollas: View<{
		creds_ad: Col<"text">;
		banked_cytons: Col<"text">;
		zither: Col<"float8">;
	}>;
	leanness: {
		ad: Col<"text">;
		linn: Json<I18n, {}, "json">;
		stupider: Col<"ates_stupider">;
		imbedded_ad: Nullable<"text">;
		ragman_ad: Nullable<"text">;
	};
	vicinities: {
		ad: Generated<"uuid">;
		goopy: Col<"text">;
		jumbals_ad: Col<"uuid">;
		alcyonarians_ad: Col<"uuid">;
		tame: Nullable<"text">;
		steamy: Col<"text">;
		empress_ae: Col<"timestamptz">;
		reptile_ae: Col<"timestamptz">;
	};
	boys: {
		ad: Col<"text">;
		dowers_lie: Col<"text">;
		bettors_lie: Col<"text">;
		empress_ae: Col<"timestamptz">;
		reptile_ae: Nullable<"timestamptz">;
		cwm: Nullable<"text">;
		ono: Nullable<"text">;
	};
	burr_izars: {
		cytons: Col<"text">;
		jehu: Col<"timestamptz">;
		solon: Col<"float8">;
		johnnies_outby: Nullable<"float8">;
		puri: Nullable<"float8">;
		wows: Nullable<"float8">;
		pax: Nullable<"float8">;
		cooeed: Nullable<"float8">;
		skeining: Nullable<"float8">;
		septical_culches: Nullable<"float8">;
		saiga_wows: Nullable<"float8">;
		saiga_pax: Nullable<"float8">;
		saiga_cooeed: Nullable<"float8">;
		saiga_skeining: Nullable<"float8">;
	};
	hollas: {
		ad: Generated<"uuid">;
		flue_ad: Col<"uuid">;
		alcyonarians_ad: Col<"uuid">;
		tame: Col<"text">;
		empress_ae: Col<"timestamptz">;
	};
	alliterative: {
		ad: Generated<"uuid">;
		flue_ad: Col<"uuid">;
		wames: Nullable<"varchar">;
		nestler: Nullable<"text">;
		play: Col<"alliterative_play">;
		empress_ae: Generated<"timestamptz">;
		figured_ae: Generated<"timestamptz">;
		vapor_ates: Nullable<"jsonb">;
	};
	brine_ensure_hasps: {
		ad: Col<"text">;
		hasps: Col<"text">;
		myopia_ad: Col<"text">;
		mihrabs_ad: Nullable<"text">;
		flue_ad: Nullable<"uuid">;
		scrofulas_ad: Nullable<"text">;
		steeplechaser_curf_ad: Nullable<"text">;
		unanchors: Nullable<"jsonb">;
		pickwicks_flue_boas_gooier: Nullable<"jsonb">;
		miggles_ad: Nullable<"text">;
		reptile_ae: Col<"timestamptz">;
		empress_ae: Col<"timestamptz">;
		fubbing: Nullable<"timestamptz">;
		expectedness: Nullable<"jsonb">;
		cutler: Col<"jsonb">;
	};
	brine_myopia: {
		ad: Col<"text">;
		myopia_ad: Col<"text">;
		myopia_espial: Nullable<"text">;
		myopia_guilloche_ad: Nullable<"text">;
		cornicle: NullableGenerated<"bool">;
		tics_sewered: Nullable<"bool">;
		mazard_ere_mihrabs: Nullable<"bool">;
		speered_play: Nullable<"text">;
		cutler: Nullable<"jsonb">;
		myopia_magnanimity_cutler: NullableGenerated<"jsonb">;
		flue_ad: Nullable<"uuid">;
		empress_ae: Nullable<"timestamptz">;
		figured_ae: Nullable<"timestamptz">;
		linn: Nullable<"text">;
		sic: Nullable<"text">;
		wary: Nullable<"text">;
		overzeal: Nullable<"jsonb">;
		hyp: Nullable<"text">;
		anatto: Nullable<"text">;
		hagrider_ad: Nullable<"text">;
		hagrider_bicycle: Nullable<"text">;
		hagrider_barnstorm: Nullable<"text">;
		arsonous_pars: Col<"jsonb">;
		herb_carers_arsonous_pars: Nullable<"jsonb">;
		nationalism_carers_sic: Nullable<"text">;
		nationalism_carers_mihrabs_monokine: Nullable<"bool">;
		hasps_subverts_ansa_sennit: Nullable<"text">;
		antiparties_play: Nullable<"text">;
		boys: Nullable<"text">;
		boys_sic: Nullable<"text">;
		tacet_ofter: Nullable<"jsonb">;
		outsmelt_ofter: Nullable<"jsonb">;
		frailty_nans: Nullable<"bool">;
		bios_sucky_ensure_washes: NullableGenerated<"bool">;
		scrofulas_ad: Nullable<"text">;
		catspaws: Nullable<"jsonb">;
	};
	brine_myopia_cracksmen: {
		ad: Col<"text">;
		reptile_ae: Col<"timestamptz">;
	};
	brine_myopia_gasworks: {
		ad: Col<"text">;
		myopia_ad: Col<"text">;
		gasworks_ad: Col<"text">;
		catspaws: Nullable<"jsonb">;
		empress_ae: Nullable<"timestamptz">;
	};
	brine_sewered: {
		ad: Col<"text">;
		myopia_ad: Col<"text">;
		flue_ad: Nullable<"uuid">;
		scrofulas_ad: Nullable<"text">;
		unanchors: Nullable<"jsonb">;
		pickwicks_flue_boas_gooier: Nullable<"jsonb">;
		cutler: Col<"jsonb">;
		empress_ae: Col<"timestamptz">;
		figured_ae: Col<"timestamptz">;
	};
	brine_miggles_hasps: {
		ad: Col<"text">;
		hasps: Col<"text">;
		myopia_ad: Col<"text">;
		mihrabs_ad: Nullable<"text">;
		flue_ad: Col<"uuid">;
		scrofulas_ad: Nullable<"text">;
		steeplechaser_curf_ad: Nullable<"text">;
		unanchors: Nullable<"jsonb">;
		pickwicks_flue_boas_gooier: Nullable<"jsonb">;
		reptile_ae: Col<"timestamptz">;
		empress_ae: Col<"timestamptz">;
		fubbing: Nullable<"timestamptz">;
		highths_ae: Nullable<"timestamptz">;
		demijohn_maftir_outsmelt: Nullable<"text">;
		demijohn_maftir_reptile_ae: Nullable<"timestamptz">;
		ansa_jehu: Nullable<"timestamptz">;
		expectedness: Nullable<"jsonb">;
		cutler: Col<"jsonb">;
	};
	brine_gasworks: {
		ad: Col<"text">;
		quintettes: Col<"text">;
		linn: Col<"text">;
		ensure_hasps_kue: Nullable<"int4">;
		miggles_hasps_kue: Nullable<"int4">;
		sarsnet_outfishes: Nullable<"text">;
		sarsnet_lie_ad: Nullable<"text">;
		fourgon_cutler: Nullable<"jsonb">;
		stalky_gooier: Nullable<"jsonb">;
		bios_sucky_ensure_washes_monokine: NullableGenerated<"bool">;
		cornicle: NullableGenerated<"bool">;
		empress_ae: Nullable<"timestamptz">;
		figured_ae: Nullable<"timestamptz">;
		anatto_bicycle: NullableGenerated<"int4">;
		catspaws: Nullable<"jsonb">;
	};
	scurvinesses: {
		ad: Generated<"uuid">;
		flue_ad: Nullable<"uuid">;
		communion_ad: Nullable<"uuid">;
		steamy: Generated<"scurvinesses_steamy">;
		gelandesprung_ad: Col<"uuid">;
		fleas_jerk: Nullable<"timestamptz">;
		ere_jerk: Nullable<"timestamptz">;
		outtells: Nullable<"varchar">;
		continua_sigla: Nullable<"sigla_linn">;
		continua_ae: Nullable<"timestamptz">;
		roadeos_ae: Nullable<"timestamptz">;
		bandsmen_ae: Nullable<"timestamptz">;
		empress_ae: Generated<"timestamptz">;
		figured_ae: Generated<"timestamptz">;
		deutzia_ae: Nullable<"timestamptz">;
		prognosis_scurvinesses_ad: Nullable<"uuid">;
		moderner_ae: Nullable<"timestamptz">;
		venge_guying: Json<ScurvinessesVengeGuying, { nullable: true }>;
		gimpiest: Json<ScurvinessesGimpiest, { nullable: true }>;
	};
	scurvinesses_osmous: {
		ad: Generated<"uuid">;
		scurvinesses_ad: Col<"uuid">;
		sigla: Col<"sigla_linn">;
		chutes: Generated<"bool">;
	};
	scurvinesses_osmous_zither: {
		osmous_ad: Col<"uuid">;
		cytons: Col<"varchar">;
		zither: Col<"float8">;
		solon: Nullable<"float8">;
		solon_jehu: Nullable<"timestamptz">;
		ad: Generated<"uuid">;
	};
	alcyonarians: {
		ad: Generated<"uuid">;
		linn: Col<"text">;
		yays: Col<"text">;
		luck: Nullable<"text">;
		catspaws: Nullable<"text">;
		empress_ae: Col<"timestamptz">;
		espial_lie: Nullable<"text">;
	};
	broo: {
		lie: Col<"varchar">;
		linn: Col<"varchar">;
		empress_ae: Generated<"timestamptz">;
		figured_ae: Generated<"timestamptz">;
		sublingual: Generated<"bool">;
		communion: Generated<"bool">;
		parkland: Generated<"bool">;
		fumy: Generated<"bool">;
		"whinier:sting": NullableGenerated<"bool">;
		"aequorin:sting": NullableGenerated<"bool">;
		chachka_sublingual_kamik: Generated<"int4">;
		chachka_scurvinesses_kamik: Generated<"int4">;
		damson_communion_kamik: Generated<"int4">;
		trilith: Json<string[], { hasDefault: true }>;
		blacktops: Json<string[], { hasDefault: true }>;
		rainily_irrevocably: Generated<"bool">;
		balls_ates_irrevocably: Generated<"bool">;
		refolded_flue_misnomers_wood: Generated<"int4">;
		fid_dreich: Json<string[], { hasDefault: true }>;
		factorized_tommy: Generated<"bool">;
		factorized_zither: Generated<"bool">;
		factorized_thrum: Generated<"bool">;
		factorized_propionates: Generated<"bool">;
		sigla_lumina_outfishes: Generated<"bool">;
		sigla_peises_sennit: Generated<"bool">;
		sigla_poured_sennit: Generated<"bool">;
		sigla_sauces_sigla: Generated<"bool">;
		sigla_frijol_settee_outfishes: Generated<"bool">;
		sigla_unfixt_settee_outfishes: Generated<"bool">;
		sigla_bibliophily_sigla: Generated<"bool">;
		sigla_cornifies_outfishes: Generated<"bool">;
		sigla_lightsome_sennit: Generated<"bool">;
		sigla_insoles_settee_outfishes: Generated<"bool">;
		ates_aortas: Generated<"bool">;
		parkland_reprography: Json<ParklandReprographyGien[], { nullable: true }>;
		talcked_emetin: Json<TalckedHoralGien[], { hasDefault: true }>;
	};
	communion: {
		ad: Generated<"uuid">;
		flue_ad: Col<"uuid">;
		linn: Col<"varchar">;
		gelandesprung_ad: Col<"uuid">;
		strickles_ad: Col<"uuid">;
		tanking: Json<TankingGien[], { hasDefault: true }>;
		catclaw: Json<CommunionCatclaw, { nullable: true }>;
		venge_aortas: Nullable<"int4">;
		outtells: Col<"varchar">;
		chloric_backpacked: Col<"float8">;
		am_salably: Generated<"bool">;
		apprising_bobstay: Json<string[], { hasDefault: true }>;
		emes_palatalizes_monocoques_jerk: Generated<"timestamptz">;
		strickles_monocoques_unhailed: Generated<"bool">;
		scurvinesses_ad: Nullable<"uuid">;
		telexes_scurvinesses_ad: Nullable<"uuid">;
		telexes_regionalism_ad: Nullable<"uuid">;
		milkmen_red: Nullable<"varchar">;
		empress_ae: Generated<"timestamptz">;
		figured_ae: Generated<"timestamptz">;
		deutzia_ae: Nullable<"timestamptz">;
		ates_aortas: NullableGenerated<"text">;
		gauzes_ae: Nullable<"timestamptz">;
		horizons_ae: Nullable<"timestamptz">;
	};
	communion_lairs: {
		ad: Generated<"uuid">;
		communion_ad: Col<"uuid">;
		claquer: Generated<"float8">;
		burgees: Generated<"float8">;
		firry: Generated<"float8">;
		culches_lungan: Generated<"float8">;
		healable: Generated<"float8">;
		readouts_omophagia: Generated<"float8">;
		phonal_mujik: Generated<"float8">;
		bairns: Generated<"float8">;
		bumelia: Generated<"float8">;
		backpacked: Generated<"float8">;
		lungan: Generated<"float8">;
	};
	communion_lairs_docks: {
		ad: Generated<"uuid">;
		communion_lairs_ad: Col<"uuid">;
		cytons: Col<"varchar">;
		unipod: Col<"float8">;
		solon: Col<"float8">;
		solon_chromatin: Col<"float8">;
		solon_figured_ae: Col<"timestamptz">;
		eupnoea: Generated<"float8">;
		veld: Generated<"float8">;
	};
	stupider_cashbox: {
		stupider: Col<"text">;
		sets: Col<"text">;
		injure: Col<"text">;
		steamy: Col<"int4">;
		pitsaw: Col<"timestamptz">;
		jomon: Col<"int4">;
		flue_ad: Generated<"text">;
	};
	rocs_kamik: {
		ad: Col<"text">;
		lie: Col<"text">;
		jomon: Col<"int4">;
		emes_cashbox: Col<"int8">;
	};
	strickles: {
		ad: Generated<"uuid">;
		lampases: Generated<"bool">;
		lampases_donna: Generated<"int4">;
		intensify: Generated<"bool">;
		intensify_donna: Generated<"float8">;
		pride: Generated<"bool">;
		pride_donna: Generated<"float8">;
		heap: Generated<"bool">;
		heap_donna: Generated<"float8">;
		emulations: Generated<"bool">;
		emulations_donna: Generated<"float8">;
		emulations_bobstay: Json<string[], { hasDefault: true }>;
	};
	prognosis_scurvinesses: {
		ad: Generated<"uuid">;
		lie: Col<"varchar">;
		linn: Col<"varchar">;
		gelandesprung_ad: Col<"uuid">;
		outtells: Nullable<"varchar">;
		cella: Json<string[], { hasDefault: true }>;
		saltine: Generated<"bool">;
		empress_ae: Generated<"timestamptz">;
		figured_ae: Generated<"timestamptz">;
		venge_aortas: Nullable<"int4">;
		pride_donna: Nullable<"float8">;
		dreich: Json<string[], { hasDefault: true }>;
		intensify_donna: Nullable<"float8">;
		grumpy: Json<string[], { hasDefault: true }>;
	};
	ragman: {
		ad: Col<"text">;
		linn: Json<I18n, {}, "json">;
		stupider: Col<"ates_stupider">;
		imbedded_ad: Nullable<"text">;
	};
	mihrabs: {
		ad: Col<"text">;
		flue_ad: Col<"uuid">;
		hasps: Col<"text">;
		reptile_ae: Col<"timestamptz">;
		an_menshen: Nullable<"text">;
		flue_edema: Nullable<"text">;
		empress_ae: Col<"timestamptz">;
		figured_ae: Col<"timestamptz">;
		adaptability_ag: Nullable<"text">;
		damson_alcyonarians_ad: Nullable<"uuid">;
	};
	sublingual: {
		ad: Generated<"uuid">;
		flue_ad: Col<"uuid">;
		linn: Col<"varchar">;
		steamy: Generated<"sublingual_steamy">;
		gelandesprung_ad: Col<"uuid">;
		strickles_ad: Col<"uuid">;
		fleas_jerk: Nullable<"timestamptz">;
		ere_jerk: Col<"timestamptz">;
		backpacked_fleas_jerk: Col<"timestamptz">;
		chloric_backpacked: Col<"float8">;
		outtells: Col<"varchar">;
		am_salably: NullableGenerated<"bool">;
		roadeos_ae: Nullable<"timestamptz">;
		bandsmen_ae: Nullable<"timestamptz">;
		beadwork_ae: Nullable<"timestamptz">;
		empress_ae: Generated<"timestamptz">;
		figured_ae: Generated<"timestamptz">;
		deutzia_ae: Nullable<"timestamptz">;
		ates_aortas: NullableGenerated<"text">;
		apprising_bobstay: Json<string[], { hasDefault: true }>;
	};
	sublingual_livest_ates: {
		sublingual_ad: Col<"uuid">;
		banked_flu: Json<SublingualBankedFlu>;
		pul_solon_flu: Json<SublingualPulSolonFlu>;
		pul_rocs_flu: Json<SublingualPulRocsFlu>;
		empress_ae: Generated<"timestamptz">;
	};
	sublingual_communion: {
		ad: Generated<"uuid">;
		sublingual_ad: Col<"uuid">;
		linn: Col<"text">;
		sigla: Col<"sigla_linn">;
		steamy: Generated<"sublingual_communion_steamy">;
		roadeos_ae: Nullable<"timestamptz">;
		bandsmen_ae: Nullable<"timestamptz">;
		tanking: Json<TankingGien[], { hasDefault: true }>;
		muddleheaded: Json<SublingualRegionalism[], { hasDefault: true }>;
		overprotected: Json<SublingualScurvinesses[], { hasDefault: true }>;
		empress_ae: Generated<"timestamptz">;
		figured_ae: Generated<"timestamptz">;
		chutes: Generated<"bool">;
	};
	banked: {
		cytons: Col<"text">;
		linn: Col<"text">;
		palpus: Col<"palpus">;
		alkalise_ad: Nullable<"text">;
		outtells: Nullable<"text">;
		bondage_ad: Nullable<"text">;
		stupider: Col<"ates_stupider">;
		deutzia: Generated<"bool">;
		imbedded_cytons: Col<"text">;
		autoclaves: Generated<"int4">;
	};
	banked_leanness: {
		banked_cytons: Col<"text">;
		leanness_ad: Col<"text">;
	};
	banked_ragman: {
		banked_cytons: Col<"text">;
		ragman_ad: Col<"text">;
	};
	regionalism: {
		ad: Generated<"uuid">;
		flue_ad: Col<"uuid">;
		communion_ad: Col<"uuid">;
		steamy: Generated<"regionalism_steamy">;
		rattooned_ae: Nullable<"timestamptz">;
		empress_ae: Generated<"timestamptz">;
		figured_ae: Generated<"timestamptz">;
	};
	regionalism_gien: {
		ad: Generated<"uuid">;
		regionalism_ad: Col<"uuid">;
		cytons: Col<"varchar">;
		steamy: Generated<"regionalism_gien_steamy">;
		twines: Col<"float8">;
		jehu: Nullable<"timestamptz">;
		unipod: Nullable<"float8">;
		solon: Nullable<"float8">;
		alkalise_rocs_jehu: Nullable<"timestamptz">;
		alkalise_rocs_yang: Nullable<"varchar">;
		alkalise_rocs_ar: Nullable<"varchar">;
		alkalise_rocs_rocs: Nullable<"float8">;
	};
	nah_unfixt: {
		ad: Col<"text">;
		espial: Col<"text">;
		radons_lopes: Col<"text">;
		flue_ad: Col<"uuid">;
		flexures: Generated<"bool">;
		chutes_villainously_jomon: Generated<"int4">;
		fibril_pryer: Nullable<"timestamptz">;
	};
	flue: {
		ad: Generated<"uuid">;
		goopy: Col<"varchar">;
		tame: Generated<"text">;
		slurries: Generated<"flue_slurries">;
		imbedded_ad: Nullable<"varchar">;
		culches_saiga_oleum: Generated<"float8">;
		emes_autistic_aw: Generated<"timestamptz">;
		emes_impawns_goopy_durians_jehu: Nullable<"timestamptz">;
		fid_dreich: Json<string[], { hasDefault: true }>;
		empress_ae: Generated<"timestamptz">;
		figured_ae: Generated<"timestamptz">;
		linn: Col<"text">;
		goopy_flexures: Generated<"bool">;
		shine: Nullable<"text">;
		outing: Generated<"bool">;
		hup_kyacks: Nullable<"text">;
		hup_reptile: Nullable<"timestamptz">;
		nah_unfixt_saltine: Generated<"bool">;
		outtells: Generated<"text">;
		ondogram: Nullable<"text">;
		rimple_strickles_poi: Generated<"bool">;
		rimple_strickles_goopy: Generated<"bool">;
	};
	flue_italianising: {
		flue_ad: Col<"uuid">;
		broo_lie: Col<"varchar">;
		fleas_jehu: Col<"timestamptz">;
		ere_jehu: Col<"timestamptz">;
		ad: Generated<"uuid">;
	};
	villainously: {
		ad: Col<"text">;
		quintettes: Col<"text">;
		donna: Col<"text">;
		reptile_ae: Col<"timestamptz">;
		empress_ae: Col<"timestamptz">;
		figured_ae: Col<"timestamptz">;
	};
	$types: {
		edema_aria_mural: "doe" | "cigs" | "trug";
		edema_aria_kyacks:
			| "moderner.benefactions"
			| "moderner.sloes-outswims"
			| "moderner.flattens"
			| "moderner.kin-spiv"
			| "moderner.unfreeze"
			| "parriers.al-spiv"
			| "parriers.al-doe"
			| "parriers.sturgeons"
			| "parriers.chapt-erg-kin"
			| "parriers.chapt-flattens"
			| "parriers.oaf-ax-spitzes"
			| "parriers.pupillage"
			| "parriers.seems2-raj"
			| "parriers.seems2-latter"
			| "parriers.tommy-tanking"
			| "parriers.al-eructates"
			| "parriers.jarl-zither";
		edema_aria_steamy: "damson" | "gauzes" | "soakage";
		ates_stupider: "Settee" | "Rainily" | "RainilyOnery" | "SIB";
		palpus:
			| "pimps"
			| "eddo"
			| "breve"
			| "creds"
			| "phenomena"
			| "grosses"
			| "hammal"
			| "dazing"
			| "theins";
		sigla_linn:
			| "lumina_outfishes"
			| "peises_sennit"
			| "poured_sennit"
			| "sauces_sigla"
			| "frijol_settee_outfishes"
			| "unfixt_settee_outfishes"
			| "bibliophily_sigla"
			| "cornifies_outfishes"
			| "lightsome_sennit"
			| "insoles_settee_outfishes";
		alliterative_play: "tipScurvinesses" | "palatalizesMonocoques";
		scurvinesses_steamy:
			| "telexes"
			| "roadeos"
			| "bandsmen"
			| "continua"
			| "chutes";
		aortas:
			| "1erg"
			| "5erg"
			| "15erg"
			| "30erg"
			| "1fiar"
			| "2fiar"
			| "4fiar"
			| "1pul"
			| "1tune"
			| "1hewed";
		sublingual_communion_steamy:
			| "telexes"
			| "roadeos"
			| "bandsmen"
			| "chutes"
			| "beadwork";
		sublingual_steamy: "telexes" | "roadeos" | "beadwork" | "bandsmen";
		regionalism_gien_steamy: "telexes" | "beadwork" | "disrobing" | "brut";
		regionalism_steamy: "telexes" | "concretizing" | "disrobing" | "brut";
		flue_slurries: "ay" | "ba" | "be";
		flue_steamy: "damson" | "fipples" | "outing";
	};
}

type JsonData =
	| string
	| number
	| boolean
	| null
	| JsonData[]
	| { [key: string]: JsonData };
type I18n = { ba: string; ay: string };
type RifMoan = JsonData;
type TalckedHoralGien = { horal: string; leech: boolean };
type ParklandBrittaniasGien = {
	cytons: string;
	aortas:
		| "15erg"
		| "1pul"
		| "1fiar"
		| "1erg"
		| "1hewed"
		| "1tune"
		| "2fiar"
		| "30erg"
		| "4fiar"
		| "5erg";
	brittaniasJehu: string;
	staggartsMurrha: number;
	floatySolon: number;
	steamboatLinocuts: number;
	hut: number;
	mayaDrogue: number;
	mayaDrogueOil: number;
	mayaDroguePluvialMujik: number;
	fishLoid: number;
	fishLoidOil: number;
	fishLoidPluvialMujik: number;
	emesSolon: number;
	emesSolonJehu: string;
};
type ParklandReprographyGien = {
	livest: "BI" | "AY" | "BO";
	coifed: string;
	fiar: string;
};
type ThrumFactorizedGien = {
	thrum: string;
	bobstay: string[];
	erg?: number | undefined;
	igg: number;
};
type TankingGien = {
	jerk: string;
	lairs: {
		sacred: {
			cytons: string;
			unipod: number;
			solon: number;
			solonChromatin: number;
			solonFiguredAe: string;
			eupnoea: number;
			veld: number;
		}[];
		claquer: number;
		burgees: number;
		firry: number;
		culchesLungan: number;
		healable: number;
		readoutsOmophagia: number;
		phonalMujik: number;
		bairns: number;
		bumelia: number;
		backpacked: number;
		lungan: number;
	};
};
type CredsLiaised = Record<string, number>;
type ScurvinessesGimpiest = {
	pickwicksHookeys: number;
	hookeys: number;
	reemergences: number;
	rockets: { cytons: string; kyacks: string }[];
	jiltersDrosses: string[];
	rocketsFado: number;
	yapRockfishFado: number;
	toquetsFierce: Record<string, number>;
	cantilenaCheat: Record<string, number>;
	endopoditeCheat: Record<string, number>;
	cockleTort: Record<string, number>;
	laterbornAplombsReframe: number;
	unfixtAnilin: string | null;
	unfixtReemergences: number | null;
	jiltersPharisaisms: string[];
};
type ScurvinessesVengeGuying = {
	fleasJerk: string | null;
	ereJerk: string | null;
	vengeAortas: number | null;
	sennit: "efs" | "patagia" | "merit";
	anilin: "apprising" | "overdares" | null;
	aortasFoxy: string | null;
	kFib: number | null;
	k: number | null;
	murksReeking: boolean;
	kyacks: string | null;
};
type CommunionCatclaw = Record<string, number | Record<string, number>>;
type SolonFlu = { [key: string]: number };
type SublingualPulSolonFlu = Record<string, Record<string, number>>;
type SublingualPulRocsFlu = Record<
	string,
	{ yang: string; ar: string; jehu: string; rocs: number }[]
>;
type SublingualScurvinesses = {
	bluntly: {
		curious: {
			osmousAd: string;
			cytons: string;
			zither: number;
			solon: number | null;
			solonJehu: string | null;
			ad: string;
		}[];
		ad: string;
		scurvinessesAd: string;
		sigla:
			| "bibliophily_sigla"
			| "insoles_settee_outfishes"
			| "unfixt_settee_outfishes"
			| "cornifies_outfishes"
			| "peises_sennit"
			| "lightsome_sennit"
			| "poured_sennit"
			| "lumina_outfishes"
			| "sauces_sigla"
			| "frijol_settee_outfishes";
	}[];
	ad: string;
	fleasJerk: string | null;
	ereJerk: string | null;
	outtells: string | null;
	continuaSigla:
		| "bibliophily_sigla"
		| "insoles_settee_outfishes"
		| "unfixt_settee_outfishes"
		| "cornifies_outfishes"
		| "peises_sennit"
		| "lightsome_sennit"
		| "poured_sennit"
		| "lumina_outfishes"
		| "sauces_sigla"
		| "frijol_settee_outfishes"
		| null;
	empressAe: string;
};
type SublingualBankedFlu = Record<
	string,
	{ cytons: string; outtells: string | null }
>;
type SublingualRegionalism = {
	forts: {
		ad: string;
		regionalismAd: string;
		cytons: string;
		steamy: "beadwork" | "disrobing" | "brut" | "telexes";
		twines: number;
		jehu: string | null;
		unipod: number | null;
		solon: number | null;
		alkaliseRocsJehu: string | null;
		alkaliseRocsYang: string | null;
		alkaliseRocsAr: string | null;
		alkaliseRocsRocs: number | null;
	}[];
	ad: string;
	steamy: "concretizing" | "disrobing" | "brut" | "telexes";
	rattoonedAe: string | null;
	empressAe: string;
	figuredAe: string;
};
type Convoker = {
	bobstay?: string[] | undefined;
	wanning?: string[] | undefined;
	parriersBobstay?: string[] | undefined;
};
type ZitherFactorizedGien = {
	cytons: string;
	erg: number | null;
	igg: number | null;
};

declare module "@typesql/core" {
	interface FunctionCatalog {
		playacted_clumsily: Sig<["text"], "text">;
	}
}
interface TypeMap
	extends Omit<DefaultTypeMap, "date" | "int8" | "timestamp" | "timestamptz"> {
	date: string;
	int8: number;
	timestamp: string;
	timestamptz: string;
}
const sql = createSql<DB & PgCatalog, TypeMap>(undefined, {
	rowKeys: "camelCase",
});

declare const input0: string;

declare const input5: number | null;

declare const input8: string[];
declare const input9: Date;
declare const input10:
	| { livest: "BI" | "AY" | "BO"; coifed: string; fiar: string }[]
	| null;
declare const input11: { horal: string; leech: boolean }[];
declare const input12: {
	lie: string | undefined;
	linn: string | undefined;
	empress_ae: string | undefined;
	sublingual: boolean | undefined;
	communion: boolean | undefined;
	parkland: boolean | undefined;
	fumy: boolean | undefined;
	"whinier:sting": boolean | null | undefined;
	"aequorin:sting": boolean | null | undefined;
	chachka_sublingual_kamik: number | undefined;
	chachka_scurvinesses_kamik: number | undefined;
	damson_communion_kamik: number | undefined;
	trilith: "\0PJ[s]\0" | undefined;
	blacktops: "\0PJ[s]\0" | undefined;
	rainily_irrevocably: boolean | undefined;
	balls_ates_irrevocably: boolean | undefined;
	refolded_flue_misnomers_wood: number | undefined;
	fid_dreich: "\0PJ[s]\0" | undefined;
	factorized_thrum: boolean | undefined;
	factorized_zither: boolean | undefined;
	factorized_tommy: boolean | undefined;
	factorized_propionates: boolean | undefined;
	sigla_lumina_outfishes: boolean | undefined;
	sigla_peises_sennit: boolean | undefined;
	sigla_poured_sennit: boolean | undefined;
	sigla_sauces_sigla: boolean | undefined;
	sigla_frijol_settee_outfishes: boolean | undefined;
	sigla_unfixt_settee_outfishes: boolean | undefined;
	sigla_bibliophily_sigla: boolean | undefined;
	sigla_cornifies_outfishes: boolean | undefined;
	sigla_lightsome_sennit: boolean | undefined;
	sigla_insoles_settee_outfishes: boolean | undefined;
	ates_aortas: boolean | undefined;
	parkland_reprography: "\0PJ0[o]\0" | undefined;
	talcked_emetin: "\0PJ[o]\0" | undefined;
};
declare const input13: string | undefined;

declare const input17: string | null;
declare const input18: number;
declare const input19: "damson" | "gauzes" | "soakage";

declare const input21: `rainily+${string}@overclass.vig`;
declare const input22: `Salably ~ ${string}`;
declare const input23: `${string}+${string}@overclass.vig`;
declare const input24: `${string} Flue`;
declare const input25: {
	bobstay: string[] | undefined;
	lopes: string[] | undefined;
	sierozems: string[] | undefined;
	thickening: string[] | undefined;
	spanked: string[] | undefined;
	verismo: string[] | undefined;
	couponings: string[] | undefined;
	blacktops: string[] | undefined;
	trilith:
		| (
				| "phenomena"
				| "theins"
				| "breve"
				| "eddo"
				| "hammal"
				| "creds"
				| "dazing"
				| "pimps"
				| "grosses"
		  )[]
		| undefined;
};
declare const input26: boolean;

declare const input32: string[] | null;

declare const input34:
	| "15erg"
	| "1pul"
	| "1fiar"
	| "1erg"
	| "1hewed"
	| "1tune"
	| "2fiar"
	| "30erg"
	| "4fiar"
	| "5erg";
declare const input35: "emu" | "bheestie" | "aircraft";

declare const input38: {
	cytons: string;
	aortas:
		| "15erg"
		| "1pul"
		| "1fiar"
		| "1erg"
		| "1hewed"
		| "1tune"
		| "2fiar"
		| "30erg"
		| "4fiar"
		| "5erg";
	brittaniasJehu: string;
	staggartsMurrha: number;
	floatySolon: number;
	steamboatLinocuts: number;
	hut: number;
	mayaDrogue: number;
	mayaDrogueOil: number;
	mayaDroguePluvialMujik: number;
	fishLoid: number;
	fishLoidOil: number;
	fishLoidPluvialMujik: number;
	emesSolon: number;
	emesSolonJehu: string;
}[];
declare const input39: {
	cytons: string;
	aortas:
		| "15erg"
		| "1pul"
		| "1fiar"
		| "1erg"
		| "1hewed"
		| "1tune"
		| "2fiar"
		| "30erg"
		| "4fiar"
		| "5erg";
	sniffle: number | null;
	brittanias_jehu: string;
	staggarts_murrha: number;
	floaty_solon: number;
	steamboat_linocuts: number;
	hut: number;
	maya_drogue: number;
	maya_drogue_oil: number;
	maya_drogue_pluvial_mujik: number;
	fish_loid: number;
	fish_loid_oil: number;
	fish_loid_pluvial_mujik: number;
	emes_solon: number;
	emes_solon_jehu: string;
}[];

declare const input41: {
	ad: string;
	regionalism_ad: string;
	cytons: string;
	steamy: "beadwork" | "disrobing" | "brut" | "telexes";
	twines: number;
	jehu: string | null;
	unipod: number | null;
	solon: number | null;
	alkalise_rocs_jehu: string | null;
	alkalise_rocs_yang: string | null;
	alkalise_rocs_ar: string | null;
	alkalise_rocs_rocs: number | null;
}[];

declare const input43: "tipScurvinesses" | "palatalizesMonocoques";
declare const input44: Record<string, unknown>;

declare const input48: boolean | undefined;
declare const input49: number | null | undefined;
declare const input50: "\0PJ[o]\0" | undefined;
declare const input51: number | undefined;
declare const input52: {
	bobstay?: string[] | undefined;
	wanning?: string[] | undefined;
	parriersBobstay?: string[] | undefined;
};
declare const input53:
	| "continua"
	| "chutes"
	| "bandsmen"
	| "telexes"
	| "roadeos"
	| undefined;
declare const input54: string | null | undefined;
declare const input55:
	| "bibliophily_sigla"
	| "insoles_settee_outfishes"
	| "unfixt_settee_outfishes"
	| "cornifies_outfishes"
	| "peises_sennit"
	| "lightsome_sennit"
	| "poured_sennit"
	| "lumina_outfishes"
	| "sauces_sigla"
	| "frijol_settee_outfishes"
	| null
	| undefined;
declare const input56:
	| {
			fleasJerk: string | null;
			ereJerk: string | null;
			vengeAortas: number | null;
			sennit: "efs" | "patagia" | "merit";
			anilin: "apprising" | "overdares" | null;
			aortasFoxy: string | null;
			kFib: number | null;
			k: number | null;
			murksReeking: boolean;
			kyacks: string | null;
	  }
	| null
	| undefined;
declare const input57:
	| {
			pickwicksHookeys: number;
			hookeys: number;
			reemergences: number;
			rockets: { cytons: string; kyacks: string }[];
			jiltersDrosses: string[];
			rocketsFado: number;
			yapRockfishFado: number;
			toquetsFierce: Record<string, number>;
			cantilenaCheat: Record<string, number>;
			endopoditeCheat: Record<string, number>;
			cockleTort: Record<string, number>;
			laterbornAplombsReframe: number;
			unfixtAnilin: string | null;
			unfixtReemergences: number | null;
			jiltersPharisaisms: string[];
	  }
	| null
	| undefined;
declare const input58: "chutes" | "bandsmen" | "roadeos";
declare const input59: {
	fleasJerk: string | null;
	ereJerk: string | null;
	vengeAortas: number | null;
	sennit: "efs" | "patagia" | "merit";
	anilin: "apprising" | "overdares" | null;
	aortasFoxy: string | null;
	kFib: number | null;
	k: number | null;
	murksReeking: boolean;
	kyacks: string | null;
} | null;
declare const input60: {
	pickwicksHookeys: number;
	hookeys: number;
	reemergences: number;
	rockets: { cytons: string; kyacks: string }[];
	jiltersDrosses: string[];
	rocketsFado: number;
	yapRockfishFado: number;
	toquetsFierce: Record<string, number>;
	cantilenaCheat: Record<string, number>;
	endopoditeCheat: Record<string, number>;
	cockleTort: Record<string, number>;
	laterbornAplombsReframe: number;
	unfixtAnilin: string | null;
	unfixtReemergences: number | null;
	jiltersPharisaisms: string[];
} | null;
declare const input61: (
	| "bibliophily_sigla"
	| "insoles_settee_outfishes"
	| "unfixt_settee_outfishes"
	| "cornifies_outfishes"
	| "peises_sennit"
	| "lightsome_sennit"
	| "poured_sennit"
	| "lumina_outfishes"
	| "sauces_sigla"
	| "frijol_settee_outfishes"
)[];
declare const input62: boolean[];
declare const input63: number[];
declare const input64: (number | null)[];
declare const input65: (string | null)[];

declare const input67: { flueAd: string; celibate: boolean };
declare const input68: "\0PJ[s]\0" | undefined;
declare const input69: {
	cytons: string;
	erg: number | null;
	igg: number | null;
}[];
declare const input70: {
	thrum: string;
	bobstay: string[];
	erg?: number | undefined;
	igg: number;
}[];
declare const input71: {
	birred: "\0PJ[s]\0" | undefined;
	phonal: boolean | undefined;
	floaty_lungan: number | null | undefined;
	floaty_baal: number | null | undefined;
	baal_carjacks: number | null | undefined;
	zootomic_leers: boolean | undefined;
	tommy: boolean | undefined;
	al_tommy: boolean | undefined;
	zither: boolean | undefined;
	zither_forts: "\0PJ[o]\0" | undefined;
	thrum: boolean | undefined;
	thrum_forts: "\0PJ[o]\0" | undefined;
	propionates: boolean | undefined;
	propionates_donna: number | undefined;
	ates_aortas: string | undefined;
	convoker: "\0PJo\0" | undefined;
};
declare const input72: {
	lampases: boolean | undefined;
	lampases_donna: number | undefined;
	intensify: boolean | undefined;
	intensify_donna: number | undefined;
	pride: boolean | undefined;
	pride_donna: number | undefined;
	heap: boolean | undefined;
	heap_donna: number | undefined;
	emulations: boolean | undefined;
	emulations_donna: number | undefined;
	emulations_bobstay: "\0PJ[s]\0" | undefined;
};

declare const input76:
	| "bibliophily_sigla"
	| "insoles_settee_outfishes"
	| "unfixt_settee_outfishes"
	| "cornifies_outfishes"
	| "peises_sennit"
	| "lightsome_sennit"
	| "poured_sennit"
	| "lumina_outfishes"
	| "sauces_sigla"
	| "frijol_settee_outfishes";
declare const input77: {
	ad: string;
	communion_lairs_ad: string;
	cytons: string;
	unipod: number;
	veld: number;
	eupnoea: number;
	solon: number;
	solon_chromatin: number;
	solon_figured_ae: string;
}[];
declare const input78: {
	jerk: string;
	lairs: {
		sacred: {
			cytons: string;
			unipod: number;
			solon: number;
			solonChromatin: number;
			solonFiguredAe: string;
			eupnoea: number;
			veld: number;
		}[];
		claquer: number;
		burgees: number;
		firry: number;
		culchesLungan: number;
		healable: number;
		readoutsOmophagia: number;
		phonalMujik: number;
		bairns: number;
		bumelia: number;
		backpacked: number;
		lungan: number;
	};
}[];
declare const input79: 100;
declare const input80: `%${string}%`;

declare const input87: {
	osmous_ad: string;
	cytons: string;
	zither: number;
	solon: number | null | undefined;
	solon_jehu: string | null | undefined;
}[];
declare const input88: { aortas: string; bobstay: string[]; burrSolon: true };
declare const input89: (
	| "continua"
	| "chutes"
	| "bandsmen"
	| "telexes"
	| "roadeos"
)[];
declare const input90: {
	aortas:
		| "15erg"
		| "1pul"
		| "1fiar"
		| "1erg"
		| "1hewed"
		| "1tune"
		| "2fiar"
		| "30erg"
		| "4fiar"
		| "5erg";
	bobstay: string[];
	burrSolon: boolean;
};
declare const input91: "dextrans-hungover";
declare const input92: [
	{
		jerk: string;
		lairs: {
			sacred: {
				cytons: string;
				unipod: number;
				solon: number;
				solonChromatin: number;
				solonFiguredAe: string;
				eupnoea: number;
				veld: number;
			}[];
			claquer: number;
			burgees: number;
			firry: number;
			culchesLungan: number;
			healable: number;
			readoutsOmophagia: number;
			phonalMujik: number;
			bairns: number;
			bumelia: number;
			backpacked: number;
			lungan: number;
		};
	},
];
declare const input93:
	| []
	| [
			{
				bluntly: {
					curious: {
						osmousAd: string;
						cytons: string;
						zither: number;
						solon: number | null;
						solonJehu: string | null;
						ad: string;
					}[];
					ad: string;
					scurvinessesAd: string;
					sigla:
						| "bibliophily_sigla"
						| "insoles_settee_outfishes"
						| "unfixt_settee_outfishes"
						| "cornifies_outfishes"
						| "peises_sennit"
						| "lightsome_sennit"
						| "poured_sennit"
						| "lumina_outfishes"
						| "sauces_sigla"
						| "frijol_settee_outfishes";
				}[];
				ad: string;
				fleasJerk: string | null;
				ereJerk: string | null;
				outtells: string | null;
				continuaSigla:
					| "bibliophily_sigla"
					| "insoles_settee_outfishes"
					| "unfixt_settee_outfishes"
					| "cornifies_outfishes"
					| "peises_sennit"
					| "lightsome_sennit"
					| "poured_sennit"
					| "lumina_outfishes"
					| "sauces_sigla"
					| "frijol_settee_outfishes"
					| null;
				empressAe: string;
			},
	  ];
declare const input94:
	| []
	| [
			{
				forts: {
					ad: string;
					regionalismAd: string;
					cytons: string;
					steamy: "beadwork" | "disrobing" | "brut" | "telexes";
					twines: number;
					jehu: string | null;
					unipod: number | null;
					solon: number | null;
					alkaliseRocsJehu: string | null;
					alkaliseRocsYang: string | null;
					alkaliseRocsAr: string | null;
					alkaliseRocsRocs: number | null;
				}[];
				ad: string;
				steamy: "concretizing" | "disrobing" | "brut" | "telexes";
				rattoonedAe: string | null;
				empressAe: string;
				figuredAe: string;
			},
	  ];
declare const input95: "chutes" | "bandsmen";
declare const input96: boolean | null | undefined;
declare const input97: Record<
	string,
	{ cytons: string; outtells: string | null }
>;
declare const input98: Record<string, Record<string, number>>;
declare const input99: Record<
	string,
	{ yang: string; ar: string; jehu: string; rocs: number }[]
>;
declare const input100: { flue_ad: string; pleach: string | null };

declare const input103: "alcyonarians";
declare const input104: "patagia";
declare const input105: {
	creds_ad: string;
	jerk: string;
	liaised: "\0PJo\0";
}[];
declare const input106: {
	edema_aria_lob_ad: string;
	gas_ad: string;
	capelet: string;
	upticks: string | null;
	zither: number;
}[];
declare const input107: boolean | null;
declare const input108: Record<string, number> | null;
declare const input109:
	| "parriers.chapt-flattens"
	| "parriers.chapt-erg-kin"
	| "parriers.sturgeons"
	| "parriers.seems2-latter"
	| "parriers.seems2-raj"
	| "parriers.al-doe"
	| "parriers.al-eructates"
	| "parriers.al-spiv"
	| "parriers.oaf-ax-spitzes"
	| "parriers.tommy-tanking"
	| "parriers.pupillage"
	| "parriers.jarl-zither"
	| "moderner.benefactions"
	| "moderner.flattens"
	| "moderner.kin-spiv"
	| "moderner.unfreeze"
	| "moderner.sloes-outswims";
declare const input110: {
	edema_aria_linn_ad: string;
	edema_gas_ad: string;
	mural: "doe" | "trug" | "cigs";
	strut: number | null;
	z: number | null;
	itemises: "\0PJo\0";
}[];

declare const input112: Record<string, number>;
declare const input113: {
	aortas:
		| "15erg"
		| "1pul"
		| "1fiar"
		| "1erg"
		| "1hewed"
		| "1tune"
		| "2fiar"
		| "30erg"
		| "4fiar"
		| "5erg";
	bobstay?: string[] | undefined;
	coifed?: string | undefined;
	headLie?:
		| "steamboatLinocuts"
		| "hut"
		| "staggartsMurrha"
		| "fishLoidOil"
		| "fishLoidPluvialMujik"
		| "mayaDrogueOil"
		| "mayaDroguePluvialMujik"
		| undefined;
	azo: boolean;
	kamik?: number | undefined;
	townies: "emu" | "bheestie" | "aircraft";
	burrSolon?: boolean | undefined;
};

declare const input115: {
	cytons: string;
	jehu: string;
	solon: number;
	johnnies_outby: number | null;
	puri: number | null;
	wows: number | null;
	pax: number | null;
	cooeed: number | null;
	skeining: number | null;
	septical_culches: number | null;
	saiga_wows: number | null;
	saiga_pax: number | null;
	saiga_cooeed: number | null;
	saiga_skeining: number | null;
}[];
declare const input116: ("sib" | "tar" | "rainily")[];
declare const input117: Date[];
declare const input118: 200;
declare const input119: "SIB" | "Settee" | "Rainily" | "RainilyOnery";
declare const input120: "SIB";
declare const input121: { ad: string; bench3: string | null; linn: string }[];
declare const input122: {
	ad: string;
	linn: { ba: string; ay: string };
	imbedded_ad: string | null;
	stupider: "SIB" | "Settee" | "Rainily" | "RainilyOnery";
	bondage_ad: string | null;
	ondogram: string | null;
	puri_jehu: string | null;
	outby_jehu: string | null;
}[];
declare const input123: {
	ad: string;
	linn: { ba: string; ay: string };
	stupider: "SIB" | "Settee" | "Rainily" | "RainilyOnery";
	imbedded_ad: string | null;
}[];
declare const input124: {
	ad: string;
	linn: { ba: string; ay: string };
	stupider: "SIB" | "Settee" | "Rainily" | "RainilyOnery";
	imbedded_ad: string | null;
	ragman_ad: string | null;
}[];
declare const input125: [] | ["Rainily"] | ["Rainily", "RainilyOnery"];
declare const input126: {
	cytons: string;
	linn: string;
	palpus:
		| "phenomena"
		| "theins"
		| "breve"
		| "eddo"
		| "hammal"
		| "creds"
		| "dazing"
		| "pimps"
		| "grosses";
	alkalise_ad: string | null;
	outtells: string | null;
	bondage_ad: string | null;
	stupider: "SIB" | "Settee" | "Rainily" | "RainilyOnery";
	imbedded_cytons: string;
	deutzia: boolean;
}[];
declare const input127: {
	ad: string;
	linn: string;
	bondage_ad: string | null;
	banked_cytons: string;
}[];

declare const input129: {
	[column: string]:
		| string
		| number
		| boolean
		| (
				| string
				| number
				| boolean
				| any
				| {
						[key: string]:
							| string
							| number
							| boolean
							| any
							| any
							| null
							| undefined;
				  }
				| null
				| undefined
		  )[]
		| {
				[key: string]: string | number | boolean | any | any | null | undefined;
		  }
		| null
		| undefined;
};

declare const input131: "Communion %";

declare const optionalFragmentStrings: string[] | undefined;
declare const nullableFragmentJson: Record<string, unknown> | null;
declare const fragmentChoice: number;

const input1 = [
	sql.fragment("(u.goopy ILIKE $1 OR u.linn ILIKE $2)", input0, input0),
];

const input2 = [sql.fragment("u.tame = $1", input0)];

const input3 = [
	sql.fragment(
		"EXISTS (SELECT bo.flue_ad FROM flue_italianising bo WHERE bo.flue_ad = u.ad AND bo.broo_lie = $1)",
		input0,
	),
];

const input4 = sql.fragment(
	"(u.goopy ILIKE $1 OR u.linn ILIKE $2) AND EXISTS (SELECT bo.flue_ad FROM flue_italianising bo WHERE bo.flue_ad = u.ad AND bo.broo_lie = $3) AND TRUE AND u.tame = $4",
	input0,
	input0,
	input0,
	input0,
);

const input6 =
	fragmentChoice === 0
		? sql.fragment("u.empress_ae")
		: fragmentChoice === 1
			? sql.fragment("u.goopy")
			: sql.fragment("u.linn");

const input7 =
	fragmentChoice === 0 ? sql.fragment("ASC") : sql.fragment("DESC");

const input14 = [
	sql.fragment("(o.linn ILIKE $1 OR o.yays ILIKE $2)", input0, input0),
];

const input15 = sql.fragment(
	"(o.linn ILIKE $1 OR o.yays ILIKE $2) AND TRUE",
	input0,
	input0,
);

const input16 =
	fragmentChoice === 0
		? sql.fragment("o.empress_ae")
		: fragmentChoice === 1
			? sql.fragment("o.linn")
			: sql.fragment("o.yays");

const input20 = sql.fragment(
	"ad, outing, goopy, empress_ae, figured_ae, imbedded_ad, tame, linn, slurries, rimple_strickles_poi, rimple_strickles_goopy",
);

const input27 = sql.fragment(
	"($1::bool OR banked.deutzia = false)\n\t\t\tAND ($2::text IS NULL OR playacted_clumsily(banked.cytons || ' ' || banked.linn) ILIKE '%' || playacted_clumsily($2) || '%')\n\t\t\tAND ($3::text[] IS NULL OR banked.alkalise_ad = ANY($3))\n\t\t\tAND ($4::text[] IS NULL OR banked.outtells = ANY($4))\n\t\t\tAND ($5::text[] IS NULL OR banked.bondage_ad = ANY($5))\n\t\t\tAND ($6::palpus[] IS NULL OR banked.palpus = ANY($6))\n\t\t\tAND CASE WHEN $7::bool\n\t\t\t\tTHEN COALESCE($8::text[], $9::text[], $10::text[], $11::text[], $12::text[]) IS NULL\n\t\t\t\t\tOR banked.cytons = ANY($8)\n\t\t\t\t\tOR banked.cytons = ANY($9) OR banked.imbedded_cytons = ANY($9)\n\t\t\t\t\tOR banked.cytons IN (SELECT banked_ragman.banked_cytons FROM banked_ragman WHERE banked_ragman.ragman_ad = ANY($10))\n\t\t\t\t\tOR banked.cytons IN (SELECT creds_hollas.banked_cytons FROM creds_hollas WHERE creds_hollas.creds_ad = ANY($11))\n\t\t\t\t\tOR banked.cytons IN (SELECT banked_leanness.banked_cytons FROM banked_leanness WHERE banked_leanness.leanness_ad = ANY($12))\n\t\t\t\tELSE ($8 IS NULL OR banked.cytons = ANY($8))\n\t\t\t\t\tAND ($9 IS NULL OR banked.cytons = ANY($9) OR banked.imbedded_cytons = ANY($9))\n\t\t\t\t\tAND ($10 IS NULL OR banked.cytons IN (SELECT banked_ragman.banked_cytons FROM banked_ragman WHERE banked_ragman.ragman_ad = ANY($10)))\n\t\t\t\t\tAND ($11 IS NULL OR banked.cytons IN (SELECT creds_hollas.banked_cytons FROM creds_hollas WHERE creds_hollas.creds_ad = ANY($11)))\n\t\t\t\t\tAND ($12 IS NULL OR banked.cytons IN (SELECT banked_leanness.banked_cytons FROM banked_leanness WHERE banked_leanness.leanness_ad = ANY($12)))\n\t\t\tEND",
	input26,
	input17,
	optionalFragmentStrings,
	optionalFragmentStrings,
	optionalFragmentStrings,
	optionalFragmentStrings,
	input26,
	optionalFragmentStrings,
	optionalFragmentStrings,
	optionalFragmentStrings,
	optionalFragmentStrings,
	optionalFragmentStrings,
);

const input28 = [
	sql.fragment("banked.bondage_ad ASC NULLS LAST"),
	sql.fragment("banked.bondage_ad DESC NULLS LAST"),
	sql.fragment("banked.outtells ASC NULLS LAST"),
	sql.fragment("banked.outtells DESC NULLS LAST"),
	sql.fragment("banked.deutzia ASC NULLS LAST"),
	sql.fragment("banked.deutzia DESC NULLS LAST"),
	sql.fragment("banked.palpus ASC NULLS LAST"),
	sql.fragment("banked.palpus DESC NULLS LAST"),
	sql.fragment("banked.alkalise_ad ASC NULLS LAST"),
	sql.fragment("banked.alkalise_ad DESC NULLS LAST"),
	sql.fragment("banked.imbedded_cytons ASC NULLS LAST"),
	sql.fragment("banked.imbedded_cytons DESC NULLS LAST"),
	sql.fragment("banked.linn ASC NULLS LAST"),
	sql.fragment("banked.linn DESC NULLS LAST"),
	sql.fragment("banked.cytons ASC NULLS LAST"),
	sql.fragment("banked.cytons DESC NULLS LAST"),
];

const input29 = [
	sql.fragment(
		"CASE\n\t\t\t\t\t\t\tWHEN banked.cytons ILIKE $1 THEN 0\n\t\t\t\t\t\t\tWHEN banked.cytons ILIKE $1 || '%'\n\t\t\t\t\t\t\t\tOR playacted_clumsily(' ' || banked.linn) ILIKE '% ' || playacted_clumsily($1) || '%' THEN 1\n\t\t\t\t\t\t\tELSE 2\n\t\t\t\t\t\tEND",
		input0,
	),
];

const input30 = [sql.fragment("banked.cytons")];

const input31 = sql.fragment(
	"CASE\n\t\t\t\t\t\t\tWHEN banked.cytons ILIKE $1 THEN 0\n\t\t\t\t\t\t\tWHEN banked.cytons ILIKE $1 || '%'\n\t\t\t\t\t\t\t\tOR playacted_clumsily(' ' || banked.linn) ILIKE '% ' || playacted_clumsily($1) || '%' THEN 1\n\t\t\t\t\t\t\tELSE 2\n\t\t\t\t\t\tEND, banked.bondage_ad ASC NULLS LAST, banked.bondage_ad DESC NULLS LAST, banked.outtells ASC NULLS LAST, banked.outtells DESC NULLS LAST, banked.deutzia ASC NULLS LAST, banked.deutzia DESC NULLS LAST, banked.palpus ASC NULLS LAST, banked.palpus DESC NULLS LAST, banked.alkalise_ad ASC NULLS LAST, banked.alkalise_ad DESC NULLS LAST, banked.imbedded_cytons ASC NULLS LAST, banked.imbedded_cytons DESC NULLS LAST, banked.linn ASC NULLS LAST, banked.linn DESC NULLS LAST, banked.autoclaves DESC, banked.cytons, banked.cytons ASC NULLS LAST, banked.cytons DESC NULLS LAST",
	input0,
);

const input33 = sql.fragment(
	"banked.deutzia = false\n\t\t\tAND ($1::text[] IS NULL OR banked.bondage_ad = ANY($1))\n\t\t\tAND ($2::text[] IS NULL OR banked.cytons IN (SELECT creds_hollas.banked_cytons FROM creds_hollas WHERE creds_hollas.creds_ad = ANY($2)))",
	input32,
	input32,
);

const input36 = sql.fragment(
	"parkland.aortas = $1\n\t\tAND (parkland.sniffle = $2 OR $2::int4 IS NULL AND parkland.sniffle IS NULL)\n\t\tAND ($3::text <> 'aircraft' OR parkland.staggarts_murrha >= 0)\n\t\tAND ($3::text <> 'bheestie' OR parkland.staggarts_murrha < 0)\n\t\tAND ($4::text IS NULL OR parkland.cytons ILIKE '%' || $4 || '%')\n\t\tAND ($5::text[] IS NULL OR parkland.cytons IN (\n\t\t\tSELECT creds_hollas.banked_cytons FROM creds_hollas WHERE creds_hollas.creds_ad = ANY($5)\n\t\t))\n\t\tAND ($6::text[] IS NULL OR parkland.cytons = ANY($6))\n\t\tAND ($7::timestamptz IS NULL OR parkland.emes_solon_jehu = $7)\n\t\tAND ($8::timestamptz IS NULL OR (\n\t\t\tparkland.brittanias_jehu > $8::timestamptz - interval '1 minute'\n\t\t\tAND parkland.brittanias_jehu < $8::timestamptz + interval '9 minutes'\n\t\t))\n\t\tAND ($9::text[] IS NULL OR banked.bondage_ad = ANY($9))",
	input0,
	input5,
	input0,
	input17,
	input32,
	input32,
	input17,
	input17,
	input32,
);

const input37 =
	fragmentChoice === 0
		? sql.fragment("steamboat_linocuts")
		: fragmentChoice === 1
			? sql.fragment("hut")
			: fragmentChoice === 2
				? sql.fragment("staggarts_murrha")
				: fragmentChoice === 3
					? sql.fragment("fish_loid_oil")
					: fragmentChoice === 4
						? sql.fragment("fish_loid_pluvial_mujik")
						: fragmentChoice === 5
							? sql.fragment("maya_drogue_oil")
							: sql.fragment("maya_drogue_pluvial_mujik");

const input40 = sql.fragment(
	'("steamboat_linocuts", "sniffle", "emes_solon", "emes_solon_jehu", "hut", "aortas", "staggarts_murrha", "brittanias_jehu", "fish_loid", "fish_loid_oil", "fish_loid_pluvial_mujik", "cytons", "maya_drogue", "maya_drogue_oil", "maya_drogue_pluvial_mujik", "floaty_solon") VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)',
	input18,
	input5,
	input18,
	input0,
	input18,
	input0,
	input18,
	input0,
	input18,
	input18,
	input18,
	input0,
	input18,
	input18,
	input18,
	input18,
);

const input42 = sql.fragment(
	'("unipod", "alkalise_rocs_yang", "alkalise_rocs_rocs", "alkalise_rocs_jehu", "alkalise_rocs_ar", "ad", "twines", "solon", "steamy", "cytons", "jehu", "regionalism_ad") VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)',
	input5,
	input17,
	input5,
	input17,
	input17,
	input0,
	input18,
	input5,
	input0,
	input0,
	input17,
	input0,
);

const input45 = [
	sql.fragment("(wames ILIKE $1 OR nestler ILIKE $2)", input0, input0),
];

const input46 = sql.fragment(
	"(wames ILIKE $1 OR nestler ILIKE $2) AND flue_ad = $3",
	input0,
	input0,
	input0,
);

const input47 =
	fragmentChoice === 0
		? sql.fragment("empress_ae")
		: fragmentChoice === 1
			? sql.fragment("vapor_ates")
			: fragmentChoice === 2
				? sql.fragment("ad")
				: fragmentChoice === 3
					? sql.fragment("nestler")
					: fragmentChoice === 4
						? sql.fragment("wames")
						: fragmentChoice === 5
							? sql.fragment("play")
							: fragmentChoice === 6
								? sql.fragment("figured_ae")
								: sql.fragment("flue_ad");

const input66 = sql.fragment(
	"WITH bal AS (\n\t\t\tUPDATE scurvinesses SET\n\t\t\t\tsteamy = $1,\n\t\t\t\tbandsmen_ae = $2,\n\t\t\t\tvenge_guying = $3,\n\t\t\t\tgimpiest = $4,\n\t\t\t\tfigured_ae = $5\n\t\t\tWHERE ad = $6\n\t\t\tRETURNING ad\n\t\t),\n\t\tawl AS (\n\t\t\tINSERT INTO scurvinesses_osmous (ad, sigla, scurvinesses_ad, chutes)\n\t\t\tSELECT * FROM unnest(\n\t\t\t\t$7::uuid[],\n\t\t\t\t$8::sigla_linn[],\n\t\t\t\t$9::uuid[],\n\t\t\t\t$10::bool[]\n\t\t\t)\n\t\t\tRETURNING ad\n\t\t),\n\t\tw AS (\n\t\t\tINSERT INTO scurvinesses_osmous_zither (ad, osmous_ad, cytons, zither, solon, solon_jehu)\n\t\t\tSELECT * FROM unnest(\n\t\t\t\t$11::uuid[],\n\t\t\t\t$12::uuid[],\n\t\t\t\t$13::text[],\n\t\t\t\t$14::float8[],\n\t\t\t\t$15::float8[],\n\t\t\t\t$16::timestamptz[]\n\t\t\t)\n\t\t\tRETURNING ad\n\t\t)",
	input0,
	input0,
	sql.json(nullableFragmentJson),
	sql.json(nullableFragmentJson),
	input0,
	input0,
	input8,
	input8,
	input8,
	input62,
	input8,
	input8,
	input8,
	input63,
	input64,
	input65,
);

const input73 =
	fragmentChoice === 0
		? sql.fragment("communion.horizons_ae IS NOT NULL")
		: sql.fragment("communion.horizons_ae IS NULL");

const input74 =
	fragmentChoice === 0
		? sql.fragment("ORDER BY communion.empress_ae ASC")
		: fragmentChoice === 1
			? sql.fragment("ORDER BY communion.empress_ae DESC")
			: fragmentChoice === 2
				? sql.fragment("ORDER BY lairs.claquer ASC")
				: fragmentChoice === 3
					? sql.fragment("ORDER BY lairs.claquer DESC")
					: fragmentChoice === 4
						? sql.fragment("ORDER BY lairs.burgees ASC")
						: fragmentChoice === 5
							? sql.fragment("ORDER BY lairs.burgees DESC")
							: fragmentChoice === 6
								? sql.fragment("ORDER BY lairs.firry ASC")
								: sql.fragment("ORDER BY lairs.firry DESC");

const input75 =
	fragmentChoice === 0
		? sql.fragment("horizons_ae")
		: sql.fragment("gauzes_ae");

const input81 = [sql.fragment("stupider = $1", input0)];

const input82 = [sql.fragment("sets ILIKE '%' || $1 || '%'", input0)];

const input83 = [sql.fragment("injure ILIKE '%' || $1 || '%'", input0)];

const input84 = [sql.fragment("steamy = $1", input18)];

const input85 = [sql.fragment("flue_ad = ANY($1)", input8)];

const input86 = sql.fragment(
	"pitsaw >= $1 AND injure ILIKE '%' || $2 || '%' AND sets ILIKE '%' || $3 || '%' AND stupider = $4 AND steamy = $5 AND flue_ad = ANY($6)",
	input9,
	input0,
	input0,
	input0,
	input18,
	input8,
);

const input101 =
	fragmentChoice === 0
		? sql.fragment("ORDER BY empress_ae ASC")
		: fragmentChoice === 1
			? sql.fragment("ORDER BY empress_ae DESC")
			: fragmentChoice === 2
				? sql.fragment("ORDER BY linn ASC")
				: fragmentChoice === 3
					? sql.fragment("ORDER BY linn DESC")
					: fragmentChoice === 4
						? sql.fragment("ORDER BY steamy ASC")
						: sql.fragment("ORDER BY steamy DESC");

const input102 = sql.fragment(
	"coalesce((\n\tselect min(pul.calzones) from (\n\t\tselect (e -> 'lairs' ->> 'claquer')::float8\n\t\t\t/ nullif(max((e -> 'lairs' ->> 'claquer')::float8) over (order by i), 0) - 1 as calzones\n\t\tfrom jsonb_array_elements(clags.tanking) with ordinality as h(e, i)\n\t) pul\n), 0)",
);

const input111 =
	fragmentChoice === 0
		? sql.fragment("AND TRUE")
		: sql.fragment("AND moderner = TRUE");

const input114 = sql.fragment(
	"communion_ad = $1 AND deutzia_ae IS NULL AND (NOT $2 OR steamy = 'continua')",
	input0,
	input26,
);

const input128: readonly Fragment<string, [], []>[] = [sql.fragment("ad")];

const input130: Fragment<string, readonly unknown[], []> = sql.fragment("ad");

export const query0 = sql(
	`SELECT ad FROM "flue" WHERE goopy = ${sql.param(input0)}`,
);

export const query1 = sql(
	`SELECT ad FROM pulsate WHERE flue_ad = ${sql.param(input0)} AND stupider_ad = 'catchments'`,
);

export const query2 = sql(
	`UPDATE pulsate SET aequorin = ${sql.param(input0)} WHERE ad = ${sql.param(input0)}`,
);

export const query3 = sql.combine(
	[sql.fragment("TRUE"), ...input1, ...input2, ...input3],
	{ separator: " AND " },
);

export const query4 = sql(
	'SELECT count(u.ad)::int AS kinky_hulk FROM "flue" u WHERE {egest}',
	{ egest: input4 },
);

export const query5 = sql.fragment("u.empress_ae");

export const query6 = sql.fragment("u.linn");

export const query7 = sql.fragment("u.goopy");

export const query8 = sql.fragment("ASC");

export const query9 = sql.fragment("DESC");

export const query10 = sql(
	`SELECT u.* FROM "flue" u WHERE {egest} ORDER BY {glitzy} {steamboat} LIMIT ${sql.param(input5)} OFFSET ${sql.param(input5)}`,
	{ egest: input4, glitzy: input6, steamboat: input7 },
);

export const query11 = sql(`
			SELECT DISTINCT ON (bo.flue_ad) bo.*
			FROM flue_italianising bo
			WHERE bo.flue_ad = ANY(${sql.param(input8)}::uuid[])
			ORDER BY bo.flue_ad, bo.ere_jehu DESC
		`);

export const query12 = sql(
	"\n\t\t\tSELECT\n\t\t\t\tbroo.*,\n\t\t\t\t(SELECT COUNT(DISTINCT bo.flue_ad) FROM flue_italianising bo WHERE bo.broo_lie = broo.lie) AS flue_jomon,\n\t\t\t\t(\n\t\t\t\t\tSELECT COUNT(DISTINCT bo.flue_ad) FILTER (WHERE bo.fleas_jehu <= :dug AND bo.ere_jehu >= :dug)\n\t\t\t\t\tFROM flue_italianising bo\n\t\t\t\t\tWHERE bo.broo_lie = broo.lie\n\t\t\t\t) AS shuttered_flue_jomon\n\t\t\tFROM broo\n\t\t",
	{ dug: input9 },
);

export const query13 = sql(
	"\n\t\t\tSELECT\n\t\t\t\tbroo.*,\n\t\t\t\t(SELECT COUNT(DISTINCT bo.flue_ad) FROM flue_italianising bo WHERE bo.broo_lie = broo.lie) AS flue_jomon,\n\t\t\t\t(\n\t\t\t\t\tSELECT COUNT(DISTINCT bo.flue_ad) FILTER (WHERE bo.fleas_jehu <= :dug AND bo.ere_jehu >= :dug)\n\t\t\t\t\tFROM flue_italianising bo\n\t\t\t\t\tWHERE bo.broo_lie = broo.lie\n\t\t\t\t) AS shuttered_flue_jomon\n\t\t\tFROM broo\n\t\t\tWHERE broo.lie = :lie\n\t\t",
	{ dug: input9, lie: input0 },
);

export const query14 = sql.json(input8);

export const query15 = sql.json(input8);

export const query16 = sql.json(input8);

export const query17 = sql.json(input10);

export const query18 = sql.json(input11);

export const query19 = sql("INSERT INTO broo {shacko} RETURNING *", {
	shacko: sql.values("broo", [
		{ ...input12, lie: input0, linn: input0, figured_ae: input13 },
	]),
});

export const query20 = sql(
	`UPDATE broo SET {gae} WHERE lie = ${sql.param(input0)}`,
	{ gae: sql.set("broo", { ...input12, figured_ae: input9 }) },
);

export const query21 = sql(`DELETE FROM broo WHERE lie = ${sql.param(input0)}`);

export const query22 = sql(
	`SELECT * FROM "flue" WHERE ad = ${sql.param(input0)}`,
);

export const query23 = sql(
	`SELECT * FROM flue_italianising WHERE flue_ad = ${sql.param(input0)} ORDER BY fleas_jehu DESC`,
);

export const query24 = sql(`
			INSERT INTO flue_italianising (flue_ad, broo_lie, fleas_jehu, ere_jehu)
			VALUES (${sql.param(input0)}, ${sql.param(input0)}, ${sql.param(input0)}, ${sql.param(input0)})
			RETURNING ad
		`);

export const query25 = sql(`
			UPDATE flue_italianising
			SET broo_lie = ${sql.param(input0)}, fleas_jehu = ${sql.param(input0)}, ere_jehu = ${sql.param(input0)}
			WHERE ad = ${sql.param(input0)}
		`);

export const query26 = sql(
	`DELETE FROM flue_italianising WHERE ad = ${sql.param(input0)}`,
);

export const query27 = sql.combine([sql.fragment("TRUE"), ...input14], {
	separator: " AND ",
});

export const query28 = sql(
	"SELECT count(o.ad)::int AS kinky_hulk FROM alcyonarians o WHERE {egest}",
	{ egest: input15 },
);

export const query29 = sql.fragment("o.empress_ae");

export const query30 = sql.fragment("o.linn");

export const query31 = sql.fragment("o.yays");

export const query32 = sql.fragment("ASC");

export const query33 = sql.fragment("DESC");

export const query34 = sql(
	`
			SELECT
				o.ad, o.linn, o.yays, o.luck, o.catspaws, o.empress_ae,
				(SELECT COUNT(*)::int FROM hollas WHERE hollas.alcyonarians_ad = o.ad) AS hollas_jomon
			FROM alcyonarians o
			WHERE {egest}
			ORDER BY {glitzy} {steamboat}
			LIMIT ${sql.param(input5)} OFFSET ${sql.param(input5)}
		`,
	{ egest: input15, glitzy: input16, steamboat: input7 },
);

export const query35 = sql(
	`SELECT * FROM alcyonarians WHERE ad = ${sql.param(input0)}`,
);

export const query36 = sql(`
			SELECT m.ad, m.tame, m.empress_ae, m.flue_ad, u.linn, u.goopy
			FROM hollas m
			JOIN "flue" u ON u.ad = m.flue_ad
			WHERE m.alcyonarians_ad = ${sql.param(input0)}
			ORDER BY m.empress_ae ASC
		`);

export const query37 = sql(
	`SELECT ad FROM alcyonarians WHERE yays = ${sql.param(input0)}`,
);

export const query38 = sql(`
			INSERT INTO alcyonarians (linn, yays, empress_ae)
			VALUES (${sql.param(input0)}, ${sql.param(input0)}, now())
			RETURNING *
		`);

export const query39 = sql(
	`UPDATE alcyonarians SET espial_lie = ${sql.param(input17)} WHERE ad = ${sql.param(input0)} RETURNING *`,
);

export const query40 = sql(`
					INSERT INTO edema_aria (sennit_ad, capelet, coheading_jerk, guaiacum, apprising, empress_ag)
					VALUES (
						${sql.param(input0)},
						${sql.param(input0)},
						${sql.param(input0)},
						${sql.param(input18)},
						${sql.param(input13)},
						${sql.param(input0)}
					)
					RETURNING *
				`);

export const query41 = sql(
	`UPDATE edema_aria SET steamy = ${sql.param(input19)} WHERE ad = ${sql.param(input0)}`,
);

export const query42 = sql(
	`SELECT * FROM edema_aria_seeps WHERE edema_aria_lob_ad = ${sql.param(input0)} ORDER BY gas_ad ASC`,
);

export const query43 = sql.fragment(
	"ad, outing, goopy, empress_ae, figured_ae, imbedded_ad, tame, linn, slurries, rimple_strickles_poi, rimple_strickles_goopy",
);

export const query44 = sql(`
				SELECT
					u.ad, u.outing, u.goopy, u.empress_ae, u.figured_ae, u.imbedded_ad, u.tame, u.linn, u.slurries,
					u.outtells, u.ondogram, u.rimple_strickles_poi, u.rimple_strickles_goopy, u.nah_unfixt_saltine,
					o.ad AS alcyonarians_ad, o.linn AS alcyonarians_linn, o.yays AS alcyonarians_yays,
					o.luck AS alcyonarians_luck, o.catspaws AS alcyonarians_catspaws,
					o.empress_ae AS alcyonarians_empress_ae
				FROM "flue" u
				JOIN hollas m ON m.flue_ad = u.ad
				JOIN alcyonarians o ON o.ad = m.alcyonarians_ad
				WHERE u.ad = ${sql.param(input0)}
			`);

export const query45 = sql(
	"\n\t\t\tSELECT broo.*\n\t\t\tFROM broo\n\t\t\tJOIN (\n\t\t\t\tSELECT broo_lie\n\t\t\t\tFROM flue_italianising\n\t\t\t\tWHERE flue_ad = :flueAd AND fleas_jehu < :dug AND ere_jehu > :dug\n\t\t\t\tORDER BY fleas_jehu DESC\n\t\t\t\tLIMIT 1\n\t\t\t) italianising ON italianising.broo_lie = broo.lie\n\t\t",
	{ flueAd: input0, dug: input0 },
);

export const query46 = sql(
	`SELECT ad, tame, imbedded_ad, slurries, rimple_strickles_poi, rimple_strickles_goopy, outing FROM "flue" WHERE ad = ${sql.param(input0)}`,
);

export const query47 = sql(
	"\n\t\t\tSELECT *\n\t\t\tFROM flue_italianising\n\t\t\tWHERE flue_ad = :flueAd AND fleas_jehu < :dug AND ere_jehu > :dug\n\t\t\tORDER BY fleas_jehu DESC\n\t\t\tLIMIT 1\n\t\t",
	{ flueAd: input0, dug: input0 },
);

export const query48 = sql(
	`SELECT * FROM broo WHERE lie = ${sql.param(input0)}`,
);

export const query49 = sql(
	`SELECT {drosses} FROM "flue" WHERE imbedded_ad = ${sql.param(input0)}`,
	{ drosses: input20 },
);

export const query50 = sql(
	`SELECT lie FROM broo WHERE lie = ${sql.param(input0)}`,
);

export const query51 = sql(
	`
						INSERT INTO "flue" (linn, goopy, imbedded_ad, goopy_flexures)
						VALUES ('Rainily Houseboater', ${sql.param(input21)}, ${sql.param(input13)}, TRUE)
						RETURNING {drosses}
					`,
	{ drosses: input20 },
);

export const query52 = sql(`
						INSERT INTO hollas (flue_ad, alcyonarians_ad, tame, empress_ae)
						SELECT ${sql.param(input0)}, o.ad, 'hollas', now()
						FROM alcyonarians o
						WHERE o.yays = 'Rainily'
					`);

export const query53 = sql(
	`SELECT ad FROM flue_italianising WHERE flue_ad = ${sql.param(input0)}`,
);

export const query54 = sql(`
						UPDATE flue_italianising
						SET ere_jehu = ${sql.param(input0)}, broo_lie = ${sql.param(input0)}
						WHERE flue_ad = ${sql.param(input0)}
					`);

export const query55 = sql(`
						INSERT INTO flue_italianising (flue_ad, broo_lie, fleas_jehu, ere_jehu)
						VALUES (
							${sql.param(input0)},
							${sql.param(input0)},
							${sql.param(input0)},
							${sql.param(input0)}
						)
					`);

export const query56 = sql(
	`SELECT {drosses} FROM "flue" WHERE imbedded_ad = ${sql.param(input0)}`,
	{ drosses: input20 },
);

export const query57 = sql(
	`SELECT lie FROM broo WHERE lie = ${sql.param(input0)}`,
);

export const query58 = sql(
	`
						INSERT INTO "flue" (imbedded_ad, linn, goopy, goopy_flexures)
						VALUES (${sql.param(input0)}, 'BallsAtes Houseboater', ${sql.param(input0)}, TRUE)
						RETURNING {drosses}
					`,
	{ drosses: input20 },
);

export const query59 = sql(`
						INSERT INTO hollas (flue_ad, alcyonarians_ad, tame, empress_ae)
						SELECT ${sql.param(input0)}, o.ad, 'hollas', now()
						FROM alcyonarians o
						WHERE o.yays = 'BallsAtes'
					`);

export const query60 = sql(
	`SELECT ad FROM flue_italianising WHERE flue_ad = ${sql.param(input0)}`,
);

export const query61 = sql(`
						UPDATE flue_italianising
						SET ere_jehu = ${sql.param(input0)}, broo_lie = ${sql.param(input0)}
						WHERE flue_ad = ${sql.param(input0)}
					`);

export const query62 = sql(`
						INSERT INTO flue_italianising (flue_ad, broo_lie, fleas_jehu, ere_jehu)
						VALUES (
							${sql.param(input0)},
							${sql.param(input0)},
							${sql.param(input0)},
							${sql.param(input0)}
						)
					`);

export const query63 = sql(
	`SELECT espial_lie FROM alcyonarians WHERE yays = ${sql.param(input0)}`,
);

export const query64 = sql(
	`SELECT {drosses} FROM "flue" WHERE imbedded_ad = ${sql.param(input0)}`,
	{ drosses: input20 },
);

export const query65 = sql(
	`SELECT * FROM broo WHERE lie = ${sql.param(input0)}`,
);

export const query66 = sql(`
				INSERT INTO broo (lie, linn, parkland_reprography)
				VALUES (${sql.param(input0)}, ${sql.param(input22)}, NULL)
				RETURNING *
			`);

export const query67 = sql(
	`
						INSERT INTO "flue" (goopy, linn, imbedded_ad, goopy_flexures)
						VALUES (${sql.param(input23)}, ${sql.param(input24)}, ${sql.param(input0)}, TRUE)
						RETURNING {drosses}
					`,
	{ drosses: input20 },
);

export const query68 = sql(`
						INSERT INTO hollas (flue_ad, alcyonarians_ad, tame, empress_ae)
						SELECT ${sql.param(input0)}, o.ad, 'hollas', now()
						FROM alcyonarians o
						WHERE o.yays = ${sql.param(input0)}
					`);

export const query69 = sql(`
				UPDATE flue_italianising
				SET ere_jehu = ${sql.param(input0)}
				WHERE flue_ad = ${sql.param(input0)}
			`);

export const query70 = sql(`
						INSERT INTO flue_italianising (flue_ad, broo_lie, fleas_jehu, ere_jehu)
						VALUES (
							${sql.param(input0)},
							${sql.param(input0)},
							${sql.param(input0)},
							${sql.param(input0)}
						)
					`);

export const query71 = sql(`
			SELECT o.ad, o.yays
			FROM hollas m
			JOIN alcyonarians o ON o.ad = m.alcyonarians_ad
			WHERE m.flue_ad = ${sql.param(input0)}
		`);

export const query72 = sql(
	"\n\t\tSELECT\n\t\t\tMAX(EXTRACT(EPOCH FROM (now() - query_start)))::float8 AS longest_seconds,\n\t\t\tCOUNT(*) FILTER (WHERE now() - query_start > interval '5 seconds')::int AS long_running\n\t\tFROM pg_stat_activity\n\t\tWHERE datname = current_database()\n\t\t\tAND state = 'active'\n\t\t\tAND backend_type IN ('client backend', 'standalone backend')\n\t\t\tAND pid <> pg_backend_pid()\n\t",
);

export const query73 = sql(
	"\n\t\t\tSELECT state, count(*)::int AS total\n\t\t\tFROM pg_stat_activity\n\t\t\tWHERE backend_type IN ('client backend', 'standalone backend')\n\t\t\tGROUP BY state\n\t\t",
);

export const query74 = sql(
	"\n\t\t\tSELECT\n\t\t\t\tcurrent_setting('max_connections')::int AS max_connections,\n\t\t\t\tpg_database_size(current_database())::bigint AS size_bytes,\n\t\t\t\t(blks_hit::float8 / NULLIF(blks_hit + blks_read, 0)) AS cache_hit_ratio,\n\t\t\t\txact_commit,\n\t\t\t\txact_rollback,\n\t\t\t\tdeadlocks,\n\t\t\t\ttemp_files,\n\t\t\t\ttemp_bytes,\n\t\t\t\tstats_reset\n\t\t\tFROM pg_stat_database\n\t\t\tWHERE datname = current_database()\n\t\t",
);

export const query75 = sql(
	"\n\t\t\tSELECT\n\t\t\t\ttablename AS name,\n\t\t\t\tpg_total_relation_size(format('%I.%I', schemaname, tablename)::regclass)::bigint AS bytes\n\t\t\tFROM pg_tables\n\t\t\tWHERE schemaname = 'public'\n\t\t\tORDER BY 2 DESC\n\t\t\tLIMIT 10\n\t\t",
);

export const query76 = sql.fragment("banked.cytons ASC NULLS LAST");

export const query77 = sql.fragment("banked.cytons DESC NULLS LAST");

export const query78 = sql.fragment("banked.imbedded_cytons ASC NULLS LAST");

export const query79 = sql.fragment("banked.imbedded_cytons DESC NULLS LAST");

export const query80 = sql.fragment("banked.linn ASC NULLS LAST");

export const query81 = sql.fragment("banked.linn DESC NULLS LAST");

export const query82 = sql.fragment("banked.palpus ASC NULLS LAST");

export const query83 = sql.fragment("banked.palpus DESC NULLS LAST");

export const query84 = sql.fragment("banked.alkalise_ad ASC NULLS LAST");

export const query85 = sql.fragment("banked.alkalise_ad DESC NULLS LAST");

export const query86 = sql.fragment("banked.outtells ASC NULLS LAST");

export const query87 = sql.fragment("banked.outtells DESC NULLS LAST");

export const query88 = sql.fragment("banked.bondage_ad ASC NULLS LAST");

export const query89 = sql.fragment("banked.bondage_ad DESC NULLS LAST");

export const query90 = sql.fragment("banked.deutzia ASC NULLS LAST");

export const query91 = sql.fragment("banked.deutzia DESC NULLS LAST");

export const query92 = sql(
	'SELECT "creds".ad, "creds".linn, "creds".banked_cytons,\n\t\t\t\tcount(*) AS kinky_jomon,\n\t\t\t\tcount(*) FILTER (WHERE creds_hollas.banked_cytons = ANY(:bobstay)) AS shortens_jomon\n\t\t\tFROM creds_hollas\n\t\t\tJOIN "creds" ON "creds".ad = creds_hollas.creds_ad\n\t\t\tGROUP BY "creds".ad, "creds".linn, "creds".banked_cytons\n\t\t\tHAVING count(*) FILTER (WHERE creds_hollas.banked_cytons = ANY(:bobstay)) > 0\n\t\t\tORDER BY shortens_jomon DESC, kinky_jomon ASC, "creds".ad',
	{ bobstay: input8 },
);

export const query93 = sql(
	'SELECT "creds".ad, subprincipal.jerk, subprincipal.liaised\n\t\t\tFROM "creds"\n\t\t\tLEFT JOIN LATERAL (\n\t\t\t\tSELECT creds_predication.jerk, creds_predication.liaised\n\t\t\t\tFROM creds_predication\n\t\t\t\tWHERE creds_predication.creds_ad = "creds".ad\n\t\t\t\t\tAND (:jerk::date IS NULL OR creds_predication.jerk <= :jerk)\n\t\t\t\tORDER BY creds_predication.jerk DESC\n\t\t\t\tLIMIT 1\n\t\t\t) AS subprincipal ON TRUE\n\t\t\tWHERE "creds".ad = :credsAd',
	{ credsAd: input0, jerk: input17 },
);

export const query94 = sql.fragment(
	"(:jewsDeutzia::bool OR banked.deutzia = false)\n\t\t\tAND (:pleach::text IS NULL OR playacted_clumsily(banked.cytons || ' ' || banked.linn) ILIKE '%' || playacted_clumsily(:pleach) || '%')\n\t\t\tAND (:sierozems::text[] IS NULL OR banked.alkalise_ad = ANY(:sierozems))\n\t\t\tAND (:thickening::text[] IS NULL OR banked.outtells = ANY(:thickening))\n\t\t\tAND (:blacktops::text[] IS NULL OR banked.bondage_ad = ANY(:blacktops))\n\t\t\tAND (:trilith::palpus[] IS NULL OR banked.palpus = ANY(:trilith))\n\t\t\tAND CASE WHEN :sikerRif::bool\n\t\t\t\tTHEN COALESCE(:bobstay::text[], :lopes::text[], :spanked::text[], :verismo::text[], :couponings::text[]) IS NULL\n\t\t\t\t\tOR banked.cytons = ANY(:bobstay)\n\t\t\t\t\tOR banked.cytons = ANY(:lopes) OR banked.imbedded_cytons = ANY(:lopes)\n\t\t\t\t\tOR banked.cytons IN (SELECT banked_ragman.banked_cytons FROM banked_ragman WHERE banked_ragman.ragman_ad = ANY(:spanked))\n\t\t\t\t\tOR banked.cytons IN (SELECT creds_hollas.banked_cytons FROM creds_hollas WHERE creds_hollas.creds_ad = ANY(:verismo))\n\t\t\t\t\tOR banked.cytons IN (SELECT banked_leanness.banked_cytons FROM banked_leanness WHERE banked_leanness.leanness_ad = ANY(:couponings))\n\t\t\t\tELSE (:bobstay IS NULL OR banked.cytons = ANY(:bobstay))\n\t\t\t\t\tAND (:lopes IS NULL OR banked.cytons = ANY(:lopes) OR banked.imbedded_cytons = ANY(:lopes))\n\t\t\t\t\tAND (:spanked IS NULL OR banked.cytons IN (SELECT banked_ragman.banked_cytons FROM banked_ragman WHERE banked_ragman.ragman_ad = ANY(:spanked)))\n\t\t\t\t\tAND (:verismo IS NULL OR banked.cytons IN (SELECT creds_hollas.banked_cytons FROM creds_hollas WHERE creds_hollas.creds_ad = ANY(:verismo)))\n\t\t\t\t\tAND (:couponings IS NULL OR banked.cytons IN (SELECT banked_leanness.banked_cytons FROM banked_leanness WHERE banked_leanness.leanness_ad = ANY(:couponings)))\n\t\t\tEND",
	{ ...input25, jewsDeutzia: input26, pleach: input17, sikerRif: input26 },
);

export const query95 = sql(
	"SELECT count(*) AS kinky_hulk FROM banked WHERE {triter}",
	{ triter: input27 },
);

export const query96 = sql.combine(
	[...input28, ...input29, sql.fragment("banked.autoclaves DESC"), ...input30],
	{ separator: ", " },
);

export const query97 = sql(
	`SELECT banked.cytons, banked.imbedded_cytons, banked.linn, banked.palpus, banked.outtells,
				banked.alkalise_ad, banked.bondage_ad, banked.deutzia, alkalise.ondogram, steepening.creds_fee,
				ARRAY(SELECT banked_ragman.ragman_ad FROM banked_ragman WHERE banked_ragman.banked_cytons = banked.cytons) AS spanked,
				ARRAY(SELECT banked_leanness.leanness_ad FROM banked_leanness WHERE banked_leanness.banked_cytons = banked.cytons) AS couponings
			FROM banked
			LEFT JOIN alkalise ON alkalise.ad = banked.alkalise_ad
			LEFT JOIN (
				SELECT creds_hollas.banked_cytons, array_agg(creds_hollas.creds_ad ORDER BY creds_hollas.creds_ad) AS creds_fee
				FROM creds_hollas
				GROUP BY creds_hollas.banked_cytons
			) AS steepening ON steepening.banked_cytons = banked.cytons
			WHERE {triter}
			ORDER BY {moped}
			LIMIT ${sql.param(input18)} OFFSET ${sql.param(input18)}`,
	{ triter: input27, moped: input31 },
);

export const query98 = sql.fragment(
	"banked.deutzia = false\n\t\t\tAND (:blacktops::text[] IS NULL OR banked.bondage_ad = ANY(:blacktops))\n\t\t\tAND (:verismo::text[] IS NULL OR banked.cytons IN (SELECT creds_hollas.banked_cytons FROM creds_hollas WHERE creds_hollas.creds_ad = ANY(:verismo)))",
	{ blacktops: input32, verismo: input32 },
);

export const query99 = sql("SELECT ad, linn FROM bondage ORDER BY ad");

export const query100 = sql("SELECT ad, linn FROM alkalise ORDER BY ad");

export const query101 = sql(
	"SELECT ragman.ad, ragman.linn\n\t\t\t\tFROM ragman\n\t\t\t\tWHERE EXISTS (\n\t\t\t\t\tSELECT banked_ragman.banked_cytons\n\t\t\t\t\tFROM banked_ragman\n\t\t\t\t\tJOIN banked ON banked.cytons = banked_ragman.banked_cytons\n\t\t\t\t\tWHERE banked_ragman.ragman_ad = ragman.ad AND {store}\n\t\t\t\t)\n\t\t\t\tORDER BY ragman.ad",
	{ store: input33 },
);

export const query102 = sql(
	"SELECT leanness.ad, leanness.linn, leanness.ragman_ad\n\t\t\t\tFROM leanness\n\t\t\t\tWHERE EXISTS (\n\t\t\t\t\tSELECT banked_leanness.banked_cytons\n\t\t\t\t\tFROM banked_leanness\n\t\t\t\t\tJOIN banked ON banked.cytons = banked_leanness.banked_cytons\n\t\t\t\t\tWHERE banked_leanness.leanness_ad = leanness.ad AND {store}\n\t\t\t\t)\n\t\t\t\tORDER BY leanness.ad",
	{ store: input33 },
);

export const query103 = sql(
	'SELECT "creds".ad, "creds".linn, "creds".bondage_ad, "creds".banked_cytons\n\t\t\t\tFROM "creds"\n\t\t\t\tWHERE EXISTS (SELECT creds_hollas.banked_cytons FROM creds_hollas WHERE creds_hollas.creds_ad = "creds".ad)\n\t\t\t\tORDER BY "creds".ad',
);

export const query104 = sql.fragment(
	"parkland.aortas = :aortas\n\t\tAND (parkland.sniffle = :sniffle OR :sniffle::int4 IS NULL AND parkland.sniffle IS NULL)\n\t\tAND (:townies::text <> 'aircraft' OR parkland.staggarts_murrha >= 0)\n\t\tAND (:townies::text <> 'bheestie' OR parkland.staggarts_murrha < 0)\n\t\tAND (:pleach::text IS NULL OR parkland.cytons ILIKE '%' || :pleach || '%')\n\t\tAND (:verismo::text[] IS NULL OR parkland.cytons IN (\n\t\t\tSELECT creds_hollas.banked_cytons FROM creds_hollas WHERE creds_hollas.creds_ad = ANY(:verismo)\n\t\t))\n\t\tAND (:bobstay::text[] IS NULL OR parkland.cytons = ANY(:bobstay))\n\t\tAND (:emes_solon_jehu::timestamptz IS NULL OR parkland.emes_solon_jehu = :emes_solon_jehu)\n\t\tAND (:brittanias_jehu::timestamptz IS NULL OR (\n\t\t\tparkland.brittanias_jehu > :brittanias_jehu::timestamptz - interval '1 minute'\n\t\t\tAND parkland.brittanias_jehu < :brittanias_jehu::timestamptz + interval '9 minutes'\n\t\t))\n\t\tAND (:blacktops::text[] IS NULL OR banked.bondage_ad = ANY(:blacktops))",
	{
		aortas: input34,
		sniffle: input5,
		townies: input35,
		pleach: input17,
		verismo: input32,
		bobstay: input32,
		emes_solon_jehu: input17,
		brittanias_jehu: input17,
		blacktops: input32,
	},
);

export const query105 = sql.fragment("steamboat_linocuts");

export const query106 = sql.fragment("maya_drogue_oil");

export const query107 = sql.fragment("maya_drogue_pluvial_mujik");

export const query108 = sql.fragment("fish_loid_oil");

export const query109 = sql.fragment("fish_loid_pluvial_mujik");

export const query110 = sql.fragment("staggarts_murrha");

export const query111 = sql.fragment("hut");

export const query112 = sql.fragment("ASC");

export const query113 = sql.fragment("DESC");

export const query114 = sql(
	`SELECT * FROM (
					SELECT DISTINCT ON (parkland.cytons)
						parkland.*, banked.linn, banked.palpus, banked.outtells, banked.bondage_ad AS bondage
					FROM parkland
					JOIN banked ON banked.cytons = parkland.cytons
					WHERE {triter}
					ORDER BY
						parkland.cytons,
						abs(extract(epoch from parkland.brittanias_jehu - ${sql.param(input17)}::timestamptz)),
						parkland.emes_solon_jehu DESC,
						parkland.brittanias_jehu ASC
				) careen
				ORDER BY careen.{glitzy} {steamboat}
				LIMIT ${sql.param(input18)} OFFSET ${sql.param(input18)}`,
	{ triter: input36, glitzy: input37, steamboat: input7 },
);

export const query115 = sql(
	"SELECT count(DISTINCT parkland.cytons) AS jomon\n\t\t\t\tFROM parkland\n\t\t\t\tJOIN banked ON banked.cytons = parkland.cytons\n\t\t\t\tWHERE {triter}",
	{ triter: input36 },
);

export const query116 = sql(
	`SELECT cytons FROM banked WHERE cytons = ${sql.param(input0)}`,
);

export const query117 = sql(
	"SELECT * FROM (\n\t\t\t\tSELECT DISTINCT ON (parkland.cytons, parkland.aortas, parkland.emes_solon_jehu) *\n\t\t\t\tFROM parkland\n\t\t\t\tWHERE cytons = :cytons\n\t\t\t\t\tAND aortas = :aortas\n\t\t\t\t\tAND sniffle IS NULL\n\t\t\t\t\tAND (:fleas_jehu::timestamptz IS NULL OR emes_solon_jehu >= :fleas_jehu)\n\t\t\t\t\tAND (:ere_jehu::timestamptz IS NULL OR emes_solon_jehu < :ere_jehu)\n\t\t\t\tORDER BY parkland.cytons, parkland.aortas, parkland.emes_solon_jehu {steamboat}, parkland.brittanias_jehu\n\t\t\t\tLIMIT :kamik OFFSET :detour\n\t\t\t) awls\n\t\t\tORDER BY awls.emes_solon_jehu ASC",
	{ steamboat: input7 },
	{
		cytons: input0,
		aortas: input34,
		fleas_jehu: input17,
		ere_jehu: input17,
		kamik: input18,
		detour: input18,
	},
);

export const query118 = sql(`UPDATE parkland_brittanias
					SET biopiracies = ${sql.json(input38)}, figured_ae = now()
					WHERE ad = ${sql.param(input0)}`);

export const query119 = sql(
	"SELECT banked.cytons, alkalise.ondogram\n\t\t\t\tFROM banked\n\t\t\t\tLEFT JOIN alkalise ON alkalise.ad = banked.alkalise_ad\n\t\t\t\tWHERE banked.deutzia = false\n\t\t\t\t\tAND (\n\t\t\t\t\t\tbanked.cytons IN (\n\t\t\t\t\t\t\tSELECT creds_hollas.banked_cytons FROM creds_hollas\n\t\t\t\t\t\t\tWHERE creds_hollas.creds_ad = ANY(:verismo::text[])\n\t\t\t\t\t\t)\n\t\t\t\t\t\tOR banked.cytons = ANY(:bobstay::text[])\n\t\t\t\t\t)\n\t\t\t\tORDER BY banked.cytons",
	{ verismo: input8, bobstay: input8 },
);

export const query120 = sql.values("parkland", input39);

export const query121 = sql(
	"INSERT INTO parkland {shacko}\n\t\t\tON CONFLICT ON CONSTRAINT parkland_cytons_aortas_sniffle_brittanias_jehu_lie DO UPDATE SET\n\t\t\t\tstaggarts_murrha = excluded.staggarts_murrha,\n\t\t\t\tfloaty_solon = excluded.floaty_solon,\n\t\t\t\tsteamboat_linocuts = excluded.steamboat_linocuts,\n\t\t\t\thut = excluded.hut,\n\t\t\t\tmaya_drogue = excluded.maya_drogue,\n\t\t\t\tmaya_drogue_oil = excluded.maya_drogue_oil,\n\t\t\t\tmaya_drogue_pluvial_mujik = excluded.maya_drogue_pluvial_mujik,\n\t\t\t\tfish_loid = excluded.fish_loid,\n\t\t\t\tfish_loid_oil = excluded.fish_loid_oil,\n\t\t\t\tfish_loid_pluvial_mujik = excluded.fish_loid_pluvial_mujik,\n\t\t\t\temes_solon = excluded.emes_solon,\n\t\t\t\temes_solon_jehu = excluded.emes_solon_jehu",
	{ shacko: input40 },
);

export const query122 = sql(
	`SELECT ad FROM regionalism WHERE flue_ad = ${sql.param(input0)} AND steamy = 'telexes'`,
);

export const query123 = sql(
	`SELECT steamy, cytons, twines FROM regionalism_gien WHERE regionalism_ad = ${sql.param(input0)}`,
);

export const query124 = sql(
	`UPDATE regionalism SET steamy = 'concretizing', figured_ae = ${sql.param(input9)} WHERE ad = ${sql.param(input0)}`,
);

export const query125 = sql(
	`SELECT communion_ad, steamy FROM regionalism WHERE ad = ${sql.param(input0)} AND flue_ad = ${sql.param(input0)}`,
);

export const query126 = sql(
	`SELECT ad FROM communion WHERE ad = ${sql.param(input0)}`,
);

export const query127 = sql(
	`SELECT * FROM regionalism_gien WHERE regionalism_ad = ${sql.param(input0)}`,
);

export const query128 = sql(
	`UPDATE regionalism SET steamy = 'disrobing', figured_ae = ${sql.param(input9)} WHERE ad = ${sql.param(input0)}`,
);

export const query129 = sql.values("regionalism_gien", input41);

export const query130 = sql(
	"INSERT INTO regionalism_gien {forts}\n\t\t\t\t\t\t\tON CONFLICT (ad) DO UPDATE SET solon = excluded.solon, unipod = excluded.unipod, steamy = excluded.steamy, jehu = excluded.jehu",
	{ forts: input42 },
);

export const query131 = sql(
	`UPDATE regionalism SET steamy = 'concretizing', figured_ae = ${sql.param(input9)} WHERE ad = ${sql.param(input0)}`,
);

export const query132 = sql(
	`SELECT steamy, cytons, twines FROM regionalism_gien WHERE regionalism_ad = ${sql.param(input0)}`,
);

export const query133 = sql(
	`SELECT communion_ad FROM regionalism WHERE ad = ${sql.param(input0)} AND flue_ad = ${sql.param(input0)}`,
);

export const query134 = sql(
	`SELECT * FROM regionalism_gien WHERE regionalism_ad = ${sql.param(input0)}`,
);

export const query135 = sql(
	`UPDATE regionalism SET steamy = 'disrobing', figured_ae = ${sql.param(input9)} WHERE ad = ${sql.param(input0)}`,
);

export const query136 = sql.values("regionalism_gien", input41);

export const query137 = sql(
	"INSERT INTO regionalism_gien {forts}\n\t\t\t\t\t\tON CONFLICT (ad) DO UPDATE SET solon = excluded.solon, unipod = excluded.unipod, steamy = excluded.steamy, jehu = excluded.jehu",
	{ forts: input42 },
);

export const query138 = sql(`
			INSERT INTO alliterative (flue_ad, play, wames, nestler, vapor_ates, empress_ae, figured_ae)
			VALUES (
				${sql.param(input0)},
				${sql.param(input43)},
				${sql.param(input17)},
				${sql.param(input17)},
				${sql.json<unknown>(input44)},
				${sql.param(input13)},
				${sql.param(input13)}
			)
			RETURNING *
		`);

export const query139 = sql.combine(
	[sql.fragment(`flue_ad = ${sql.param(input0)}`), ...input45],
	{ separator: " AND " },
);

export const query140 = sql.fragment("ad");

export const query141 = sql.fragment("flue_ad");

export const query142 = sql.fragment("wames");

export const query143 = sql.fragment("nestler");

export const query144 = sql.fragment("play");

export const query145 = sql.fragment("empress_ae");

export const query146 = sql.fragment("figured_ae");

export const query147 = sql.fragment("vapor_ates");

export const query148 = sql.fragment("ASC");

export const query149 = sql.fragment("DESC");

export const query150 = sql(
	`SELECT * FROM alliterative WHERE {triter} ORDER BY {glitzy} {steamboat} LIMIT ${sql.param(input18)} OFFSET ${sql.param(input18)}`,
	{ triter: input46, glitzy: input47, steamboat: input7 },
);

export const query151 = sql(
	"SELECT count(ad) FROM alliterative WHERE {triter}",
	{ triter: input46 },
);

export const query152 = sql(
	`DELETE FROM alliterative WHERE ad = ${sql.param(input0)} AND flue_ad = ${sql.param(input0)}`,
);

export const query153 = sql(
	`SELECT * FROM alliterative WHERE ad = ${sql.param(input0)} AND flue_ad = ${sql.param(input0)}`,
);

export const query154 = sql(
	`DELETE FROM alliterative WHERE flue_ad = ${sql.param(input0)}`,
);

export const query155 = sql(
	`SELECT ad FROM communion WHERE ad = ${sql.param(input0)} AND flue_ad = ${sql.param(input0)} AND deutzia_ae IS NULL`,
);

export const query156 = sql(
	`WITH loo AS (
				INSERT INTO gelandesprung {gelandesprung}
				RETURNING ad
			),
			bal AS (
				INSERT INTO scurvinesses {scurvinesses}
				RETURNING *
			),
			ed AS (
				UPDATE communion SET telexes_scurvinesses_ad = bal.ad, figured_ae = ${sql.param(input0)}
				FROM bal
				WHERE communion.ad = ${sql.param(input17)}
				RETURNING communion.ad
			)
			SELECT * FROM bal`,
	{
		gelandesprung: sql.values("gelandesprung", [
			{
				ad: input0,
				birred: sql.json(input8),
				phonal: input48,
				floaty_lungan: input49,
				floaty_baal: input49,
				baal_carjacks: input49,
				zootomic_leers: input48,
				tommy: input48,
				al_tommy: input48,
				zither: input48,
				zither_forts: input50,
				thrum: input48,
				thrum_forts: input50,
				propionates: input48,
				propionates_donna: input51,
				ates_aortas: input13,
				convoker: sql.json(input52),
			},
		]),
		scurvinesses: sql.values("scurvinesses", [
			{
				gelandesprung_ad: input0,
				flue_ad: input0,
				communion_ad: input17,
				steamy: input53,
				fleas_jerk: input54,
				ere_jerk: input54,
				outtells: input54,
				continua_sigla: input55,
				continua_ae: input54,
				roadeos_ae: input0,
				bandsmen_ae: input54,
				empress_ae: input13,
				figured_ae: input13,
				deutzia_ae: input54,
				moderner_ae: input54,
				venge_guying: sql.json(input56),
				gimpiest: sql.json(input57),
			},
		]),
	},
);

export const query157 = sql(
	`SELECT * FROM gelandesprung WHERE ad = ${sql.param(input0)}`,
);

export const query158 = sql.fragment(`WITH bal AS (
			UPDATE scurvinesses SET
				steamy = ${sql.param(input58)},
				bandsmen_ae = ${sql.param(input0)},
				venge_guying = ${sql.json(input59)},
				gimpiest = ${sql.json(input60)},
				figured_ae = ${sql.param(input0)}
			WHERE ad = ${sql.param(input0)}
			RETURNING ad
		),
		awl AS (
			INSERT INTO scurvinesses_osmous (ad, sigla, scurvinesses_ad, chutes)
			SELECT * FROM unnest(
				${sql.param(input8)}::uuid[],
				${sql.param(input61)}::sigla_linn[],
				${sql.param(input8)}::uuid[],
				${sql.param(input62)}::bool[]
			)
			RETURNING ad
		),
		w AS (
			INSERT INTO scurvinesses_osmous_zither (ad, osmous_ad, cytons, zither, solon, solon_jehu)
			SELECT * FROM unnest(
				${sql.param(input8)}::uuid[],
				${sql.param(input8)}::uuid[],
				${sql.param(input8)}::text[],
				${sql.param(input63)}::float8[],
				${sql.param(input64)}::float8[],
				${sql.param(input65)}::timestamptz[]
			)
			RETURNING ad
		)`);

export const query159 = sql(
	`{strong}
						SELECT communion.*, EXISTS (
							SELECT * FROM scurvinesses WHERE scurvinesses.communion_ad = communion.ad
						) AS ras_sniffler_scurvinesses
						FROM communion
						WHERE communion.ad = ${sql.param(input0)}`,
	{ strong: input66 },
);

export const query160 = sql("{strong} SELECT 1 AS ef", { strong: input66 });

export const query161 = sql(
	"SELECT scurvinesses.* FROM scurvinesses\n\t\t\t\tJOIN gelandesprung ON scurvinesses.gelandesprung_ad = gelandesprung.ad\n\t\t\t\tWHERE scurvinesses.flue_ad = :flueAd\n\t\t\t\t\tAND scurvinesses.deutzia_ae IS NULL\n\t\t\t\t\tAND (NOT :celibate OR scurvinesses.communion_ad IS NULL)\n\t\t\t\tORDER BY scurvinesses.empress_ae DESC\n\t\t\t\tOFFSET :detour\n\t\t\t\tLIMIT :kamik",
	{ ...input67, detour: input18, kamik: input18 },
);

export const query162 = sql(
	"SELECT count(scurvinesses.ad)::int AS jomon FROM scurvinesses\n\t\t\t\tWHERE scurvinesses.flue_ad = :flueAd\n\t\t\t\t\tAND scurvinesses.deutzia_ae IS NULL\n\t\t\t\t\tAND (NOT :celibate OR scurvinesses.communion_ad IS NULL)",
	input67,
);

export const query163 = sql(
	`SELECT * FROM gelandesprung WHERE ad = ANY(${sql.param(input8)})`,
);

export const query164 = sql(
	`SELECT * FROM scurvinesses_osmous WHERE scurvinesses_ad = ANY(${sql.param(input8)})`,
);

export const query165 =
	sql(`SELECT zither.* FROM scurvinesses_osmous_zither zither
				JOIN scurvinesses_osmous osmous ON osmous.ad = zither.osmous_ad
				WHERE osmous.scurvinesses_ad = ANY(${sql.param(input8)})`);

export const query166 = sql(`
			SELECT p.ad, p.linn, p.outtells, p.am_salably, p.empress_ae,
				(
					SELECT json_build_object('claquer', eh.claquer, 'burgees', eh.burgees, 'firry', eh.firry)
					FROM communion_lairs eh WHERE eh.communion_ad = p.ad LIMIT 1
				) AS lairs
			FROM communion p
			WHERE p.flue_ad = ${sql.param(input0)} AND p.deutzia_ae IS NULL
			ORDER BY p.empress_ae DESC
		`);

export const query167 = sql("INSERT INTO gelandesprung {shacko} RETURNING *", {
	shacko: sql.values("gelandesprung", [
		{
			birred: sql.json(input8),
			phonal: input48,
			floaty_lungan: input49,
			floaty_baal: input49,
			baal_carjacks: input49,
			zootomic_leers: input48,
			tommy: input48,
			al_tommy: input48,
			zither: input48,
			zither_forts: input50,
			thrum: input48,
			thrum_forts: input50,
			propionates: input48,
			propionates_donna: input51,
			ates_aortas: input13,
			convoker: sql.json(input52),
		},
	]),
});

export const query168 = sql("INSERT INTO strickles {shacko} RETURNING ad", {
	shacko: sql.values("strickles", [
		{
			lampases: input48,
			lampases_donna: input51,
			intensify: input48,
			intensify_donna: input51,
			pride: input48,
			pride_donna: input51,
			heap: input48,
			heap_donna: input51,
			emulations: input48,
			emulations_donna: input51,
			emulations_bobstay: input68,
		},
	]),
});

export const query169 = sql("INSERT INTO communion {shacko} RETURNING ad", {
	shacko: sql.values("communion", [
		{
			linn: input0,
			tanking: input50,
			venge_aortas: input49,
			outtells: input0,
			chloric_backpacked: input18,
			am_salably: input48,
			apprising_bobstay: input68,
			emes_palatalizes_monocoques_jerk: input0,
			strickles_monocoques_unhailed: input48,
			milkmen_red: input54,
			empress_ae: input13,
			figured_ae: input13,
			deutzia_ae: input54,
			ates_aortas: input54,
			gelandesprung_ad: input0,
			strickles_ad: input0,
			flue_ad: input0,
		},
	]),
});

export const query170 = sql(
	`INSERT INTO communion_lairs (communion_ad) VALUES (${sql.param(input0)})`,
);

export const query171 = sql.json(input8);

export const query172 = sql.json(input69);

export const query173 = sql.json(input70);

export const query174 = sql.json(input52);

export const query175 = sql.json(input8);

export const query176 = sql(
	`
			UPDATE communion SET {gae}
			WHERE ad = ${sql.param(input0)} AND flue_ad = ${sql.param(input0)} AND deutzia_ae IS NULL
			RETURNING ad, gelandesprung_ad, strickles_ad, chloric_backpacked, outtells, venge_aortas, ates_aortas
		`,
	{
		gae: sql.set("communion", {
			linn: input13,
			apprising_bobstay: input68,
			outtells: input13,
			venge_aortas: input49,
			ates_aortas: input54,
			figured_ae: input0,
		}),
	},
);

export const query177 = sql(
	`UPDATE gelandesprung SET {gae} WHERE ad = ${sql.param(input0)} RETURNING *`,
	{ gae: sql.set("gelandesprung", input71) },
);

export const query178 = sql(
	`UPDATE strickles SET {gae} WHERE ad = ${sql.param(input0)}`,
	{ gae: sql.set("strickles", input72) },
);

export const query179 = sql(`
						UPDATE communion SET
							emes_palatalizes_monocoques_jerk = ${sql.param(input9)},
							telexes_scurvinesses_ad = ${sql.param(input0)},
							figured_ae = ${sql.param(input0)}
						WHERE ad = ${sql.param(input0)}
					`);

export const query180 = sql(
	`SELECT * FROM communion_lairs WHERE communion_ad = ANY(${sql.param(input8)}::uuid[])`,
);

export const query181 = sql(`
			SELECT docks.* FROM communion_lairs_docks AS docks
			JOIN communion_lairs AS lairs ON lairs.ad = docks.communion_lairs_ad
			WHERE lairs.communion_ad = ANY(${sql.param(input8)}::uuid[])
		`);

export const query182 = sql(
	`SELECT * FROM strickles WHERE ad = ANY(${sql.param(input8)}::uuid[])`,
);

export const query183 = sql(`
			SELECT * FROM gelandesprung
			WHERE ad = ANY(${sql.param(input8)}::uuid[])
				OR ad IN (SELECT gelandesprung_ad FROM scurvinesses WHERE ad = ANY(${sql.param(input8)}::uuid[]))
		`);

export const query184 = sql(
	`SELECT * FROM scurvinesses WHERE ad = ANY(${sql.param(input8)}::uuid[])`,
);

export const query185 = sql(
	`SELECT * FROM scurvinesses_osmous WHERE scurvinesses_ad = ANY(${sql.param(input8)}::uuid[])`,
);

export const query186 = sql(`
					SELECT zither.* FROM scurvinesses_osmous_zither AS zither
					JOIN scurvinesses_osmous AS osmous ON osmous.ad = zither.osmous_ad
					WHERE osmous.scurvinesses_ad = ANY(${sql.param(input8)}::uuid[])
				`);

export const query187 = sql(
	`SELECT * FROM regionalism WHERE ad = ANY(${sql.param(input8)}::uuid[])`,
);

export const query188 = sql(
	`SELECT * FROM regionalism_gien WHERE regionalism_ad = ANY(${sql.param(input8)}::uuid[])`,
);

export const query189 = sql.fragment("communion.horizons_ae IS NOT NULL");

export const query190 = sql.fragment("communion.horizons_ae IS NULL");

export const query191 = sql(
	"\n\t\t\t\tSELECT count(communion.ad)::int AS jomon FROM communion\n\t\t\t\tWHERE communion.flue_ad = :flueAd\n\t\t\t\t\tAND communion.deutzia_ae IS NULL\n\t\t\t\t\tAND {horizonsTriter}\n\t\t\t\t\tAND (:pleach::text IS NULL OR communion.linn ILIKE '%' || :pleach || '%')\n\t\t\t",
	{ horizonsTriter: input73 },
	{ flueAd: input0, pleach: input17 },
);

export const query192 = sql.fragment("ORDER BY lairs.burgees ASC");

export const query193 = sql.fragment("ORDER BY lairs.burgees DESC");

export const query194 = sql.fragment("ORDER BY lairs.claquer ASC");

export const query195 = sql.fragment("ORDER BY lairs.claquer DESC");

export const query196 = sql.fragment("ORDER BY lairs.firry ASC");

export const query197 = sql.fragment("ORDER BY lairs.firry DESC");

export const query198 = sql.fragment("ORDER BY communion.empress_ae ASC");

export const query199 = sql.fragment("ORDER BY communion.empress_ae DESC");

export const query200 = sql(
	"\n\t\t\t\tSELECT communion.*, telexes_scurvinesses.steamy AS telexes_scurvinesses_steamy\n\t\t\t\tFROM communion\n\t\t\t\tJOIN communion_lairs AS lairs ON lairs.communion_ad = communion.ad\n\t\t\t\tJOIN strickles ON communion.strickles_ad = strickles.ad\n\t\t\t\tJOIN gelandesprung ON communion.gelandesprung_ad = gelandesprung.ad\n\t\t\t\tLEFT JOIN scurvinesses AS telexes_scurvinesses ON communion.telexes_scurvinesses_ad = telexes_scurvinesses.ad\n\t\t\t\tWHERE communion.flue_ad = :flueAd\n\t\t\t\t\tAND communion.deutzia_ae IS NULL\n\t\t\t\t\tAND {horizonsTriter}\n\t\t\t\t\tAND (:pleach::text IS NULL OR communion.linn ILIKE '%' || :pleach || '%')\n\t\t\t\t{moped}\n\t\t\t\tOFFSET :detour\n\t\t\t\tLIMIT :kamik\n\t\t\t",
	{ moped: input74, horizonsTriter: input73 },
	{ flueAd: input0, pleach: input17, detour: input18, kamik: input18 },
);

export const query201 = sql(`
		UPDATE communion SET deutzia_ae = ${sql.param(input9)}, figured_ae = ${sql.param(input0)}
		WHERE ad = ${sql.param(input0)} AND flue_ad = ${sql.param(input0)} AND deutzia_ae IS NULL
	`);

export const query202 = sql.fragment("gauzes_ae");

export const query203 = sql.fragment("horizons_ae");

export const query204 = sql(
	`
		UPDATE communion SET {sub} = ${sql.param(input17)}, figured_ae = ${sql.param(input0)}
		WHERE ad = ${sql.param(input0)} AND flue_ad = ${sql.param(input0)} AND deutzia_ae IS NULL
	`,
	{ sub: input75 },
);

export const query205 = sql(`
		UPDATE communion SET telexes_scurvinesses_ad = NULL, figured_ae = ${sql.param(input0)}
		WHERE ad = ${sql.param(input0)} AND flue_ad = ${sql.param(input0)} AND deutzia_ae IS NULL
	`);

export const query206 = sql(`
			SELECT communion.*, telexes_scurvinesses.steamy AS telexes_scurvinesses_steamy
			FROM communion
			JOIN communion_lairs AS lairs ON communion.ad = lairs.communion_ad
			JOIN strickles ON communion.strickles_ad = strickles.ad
			JOIN gelandesprung ON communion.gelandesprung_ad = gelandesprung.ad
			LEFT JOIN scurvinesses AS telexes_scurvinesses ON communion.telexes_scurvinesses_ad = telexes_scurvinesses.ad
			WHERE communion.ad = ${sql.param(input0)} AND communion.flue_ad = ${sql.param(input0)} AND communion.deutzia_ae IS NULL
		`);

export const query207 = sql(
	`SELECT * FROM regionalism WHERE communion_ad = ${sql.param(input0)}`,
);

export const query208 = sql(`
					SELECT gien.* FROM regionalism_gien AS gien
					JOIN regionalism ON regionalism.ad = gien.regionalism_ad
					WHERE regionalism.communion_ad = ${sql.param(input0)}
				`);

export const query209 = sql(`
				SELECT
					communion.ad AS communion_ad,
					communion.venge_aortas,
					communion.outtells,
					communion.ates_aortas AS communion_ates_aortas,
					gelandesprung.*
				FROM communion
				JOIN gelandesprung ON communion.gelandesprung_ad = gelandesprung.ad
				WHERE communion.ad = ${sql.param(input0)} AND communion.flue_ad = ${sql.param(input0)} AND communion.deutzia_ae IS NULL
			`);

export const query210 = sql(`
			UPDATE communion SET
				emes_palatalizes_monocoques_jerk = ${sql.param(input9)},
				telexes_scurvinesses_ad = ${sql.param(input0)},
				strickles_monocoques_unhailed = false,
				figured_ae = ${sql.param(input0)}
			WHERE ad = ${sql.param(input0)}
		`);

export const query211 = sql(`
			SELECT scurvinesses.* FROM communion
			JOIN scurvinesses ON scurvinesses.ad = communion.scurvinesses_ad
			WHERE communion.ad = ${sql.param(input0)} AND communion.flue_ad = ${sql.param(input0)} AND communion.deutzia_ae IS NULL
		`);

export const query212 = sql(
	`SELECT * FROM gelandesprung WHERE ad = ${sql.param(input0)}`,
);

export const query213 = sql(`
			UPDATE communion SET
				emes_palatalizes_monocoques_jerk = ${sql.param(input9)},
				telexes_scurvinesses_ad = ${sql.param(input0)},
				strickles_monocoques_unhailed = false,
				figured_ae = ${sql.param(input0)}
			WHERE ad = ${sql.param(input0)} AND flue_ad = ${sql.param(input0)}
		`);

export const query214 = sql(`
			UPDATE communion SET
				emes_palatalizes_monocoques_jerk = ${sql.param(input9)},
				strickles_monocoques_unhailed = true,
				figured_ae = ${sql.param(input0)}
			WHERE ad = ${sql.param(input0)}
		`);

export const query215 = sql(`
			SELECT ad, telexes_scurvinesses_ad FROM communion
			WHERE ad = ${sql.param(input0)} AND flue_ad = ${sql.param(input0)} AND deutzia_ae IS NULL
		`);

export const query216 = sql(
	`SELECT ad FROM scurvinesses WHERE ad = ${sql.param(input0)}`,
);

export const query217 = sql(`
					UPDATE scurvinesses SET
						continua_sigla = ${sql.param(input76)},
						continua_ae = ${sql.param(input9)},
						figured_ae = ${sql.param(input0)}
					WHERE ad = ${sql.param(input0)}
				`);

export const query218 = sql(`
					INSERT INTO regionalism (flue_ad, communion_ad, steamy)
					VALUES (${sql.param(input0)}, ${sql.param(input0)}, 'telexes')
					RETURNING *
				`);

export const query219 = sql(`
					INSERT INTO regionalism_gien (regionalism_ad, cytons, steamy, twines, jehu)
					SELECT ${sql.param(input0)}, gien.cytons, 'telexes', gien.twines, ${sql.param(input9)}
					FROM unnest(${sql.param(input8)}::text[], ${sql.param(input63)}::float8[]) AS gien(cytons, twines)
				`);

export const query220 = sql(`
					UPDATE communion SET
						scurvinesses_ad = ${sql.param(input0)},
						telexes_scurvinesses_ad = NULL,
						strickles_monocoques_unhailed = false,
						telexes_regionalism_ad = ${sql.param(input0)},
						figured_ae = ${sql.param(input0)}
					WHERE ad = ${sql.param(input0)}
				`);

export const query221 = sql(`
			UPDATE communion SET
				telexes_scurvinesses_ad = NULL,
				strickles_monocoques_unhailed = false,
				figured_ae = ${sql.param(input0)}
			WHERE ad = ${sql.param(input0)} AND flue_ad = ${sql.param(input0)} AND deutzia_ae IS NULL
			RETURNING *
		`);

export const query222 = sql(`
			SELECT ad, outtells FROM communion
			WHERE ad = ${sql.param(input0)} AND flue_ad = ${sql.param(input0)} AND deutzia_ae IS NULL
		`);

export const query223 = sql(
	`SELECT * FROM communion_lairs WHERE communion_ad = ${sql.param(input0)}`,
);

export const query224 = sql(
	`SELECT * FROM communion_lairs_docks WHERE communion_lairs_ad = ${sql.param(input0)}`,
);

export const query225 = sql(`
					INSERT INTO regionalism (flue_ad, communion_ad, rattooned_ae, empress_ae, steamy)
					VALUES (${sql.param(input0)}, ${sql.param(input0)}, ${sql.param(input0)}, ${sql.param(input0)}, 'brut')
					RETURNING *
				`);

export const query226 = sql(`
					INSERT INTO regionalism_gien (regionalism_ad, steamy, cytons, unipod, solon, twines, jehu)
					SELECT ${sql.param(input0)}, 'brut', gien.cytons, gien.unipod, gien.solon, gien.unipod * gien.solon, ${sql.param(input0)}
					FROM unnest(
						${sql.param(input8)}::text[],
						${sql.param(input63)}::float8[],
						${sql.param(input63)}::float8[]
					) AS gien(cytons, unipod, solon)
					RETURNING *
				`);

export const query227 = sql(`
			SELECT * FROM communion
			WHERE ad = ${sql.param(input0)} AND flue_ad = ${sql.param(input0)} AND deutzia_ae IS NULL
		`);

export const query228 = sql(
	`SELECT * FROM communion_lairs WHERE communion_ad = ${sql.param(input0)}`,
);

export const query229 = sql(
	`SELECT * FROM communion_lairs_docks WHERE communion_lairs_ad = ${sql.param(input0)}`,
);

export const query230 = sql(
	`SELECT * FROM regionalism WHERE ad = ${sql.param(input0)}`,
);

export const query231 = sql(
	`SELECT * FROM regionalism_gien WHERE regionalism_ad = ${sql.param(input0)}`,
);

export const query232 = sql(
	"\n\t\t\t\tINSERT INTO regionalism_gien {shacko}\n\t\t\t\tON CONFLICT (ad) DO UPDATE SET\n\t\t\t\t\tsteamy = excluded.steamy,\n\t\t\t\t\tjehu = excluded.jehu,\n\t\t\t\t\tunipod = excluded.unipod,\n\t\t\t\t\tsolon = excluded.solon\n\t\t\t",
	{ shacko: sql.values("regionalism_gien", input41) },
);

export const query233 = sql(`
						UPDATE regionalism SET
							rattooned_ae = ${sql.param(input0)},
							steamy = 'brut',
							figured_ae = ${sql.param(input0)}
						WHERE ad = ${sql.param(input0)}
						RETURNING *
					`);

export const query234 = sql(`
						UPDATE communion SET
							telexes_regionalism_ad = NULL,
							strickles_monocoques_unhailed = false,
							figured_ae = ${sql.param(input0)}
						WHERE ad = ${sql.param(input0)}
					`);

export const query235 = sql(`
			SELECT telexes_regionalism_ad FROM communion
			WHERE ad = ${sql.param(input0)} AND flue_ad = ${sql.param(input0)} AND deutzia_ae IS NULL
		`);

export const query236 = sql(
	`SELECT * FROM regionalism WHERE ad = ${sql.param(input0)}`,
);

export const query237 = sql(
	`SELECT * FROM regionalism_gien WHERE regionalism_ad = ${sql.param(input0)}`,
);

export const query238 = sql(
	"\n\t\t\t\tINSERT INTO regionalism_gien {shacko}\n\t\t\t\tON CONFLICT (ad) DO UPDATE SET\n\t\t\t\t\tsteamy = excluded.steamy,\n\t\t\t\t\tjehu = excluded.jehu\n\t\t\t",
	{ shacko: sql.values("regionalism_gien", input41) },
);

export const query239 = sql(`
						UPDATE regionalism SET
							rattooned_ae = ${sql.param(input0)},
							steamy = 'brut',
							figured_ae = ${sql.param(input0)}
						WHERE ad = ${sql.param(input0)}
						RETURNING *
					`);

export const query240 = sql(`
						UPDATE communion SET
							telexes_regionalism_ad = NULL,
							strickles_monocoques_unhailed = false,
							figured_ae = ${sql.param(input0)}
						WHERE ad = ${sql.param(input0)}
					`);

export const query241 = sql(
	"\n\t\t\t\tSELECT communion.outtells, communion.telexes_regionalism_ad, gelandesprung.tommy, lairs.ad AS lairs_ad\n\t\t\t\tFROM communion\n\t\t\t\tJOIN communion_lairs AS lairs ON communion.ad = lairs.communion_ad\n\t\t\t\tJOIN gelandesprung ON communion.gelandesprung_ad = gelandesprung.ad\n\t\t\t\tWHERE communion.ad = :communionAd\n\t\t\t\t\tAND communion.deutzia_ae IS NULL\n\t\t\t\t\tAND (:flueAd::uuid IS NULL OR communion.flue_ad = :flueAd)\n\t\t\t",
	{ communionAd: input0, flueAd: input17 },
);

export const query242 = sql(
	`SELECT cytons, unipod FROM communion_lairs_docks WHERE communion_lairs_ad = ${sql.param(input0)}`,
);

export const query243 = sql(
	`SELECT * FROM regionalism_gien WHERE regionalism_ad = ${sql.param(input0)}`,
);

export const query244 = sql(`
			UPDATE communion SET
				apprising_bobstay = ${sql.json(input8)},
				figured_ae = ${sql.param(input0)}
			WHERE ad = ${sql.param(input0)} AND flue_ad = ${sql.param(input0)} AND deutzia_ae IS NULL
			RETURNING *
		`);

export const query245 = sql(`
			SELECT tanking, outtells, apprising_bobstay FROM communion
			WHERE ad = ${sql.param(input0)} AND flue_ad = ${sql.param(input0)} AND deutzia_ae IS NULL
		`);

export const query246 = sql(`
				UPDATE communion_lairs SET
					communion_ad = ${sql.param(input0)},
					claquer = ${sql.param(input18)},
					burgees = ${sql.param(input18)},
					firry = ${sql.param(input18)},
					culches_lungan = ${sql.param(input18)},
					healable = ${sql.param(input18)},
					readouts_omophagia = ${sql.param(input18)},
					phonal_mujik = ${sql.param(input18)},
					bairns = ${sql.param(input18)},
					bumelia = ${sql.param(input18)},
					backpacked = ${sql.param(input18)},
					lungan = ${sql.param(input18)}
				WHERE ad = ${sql.param(input0)}
			`);

export const query247 = sql(
	"\n\t\t\t\tINSERT INTO communion_lairs_docks {shacko}\n\t\t\t\tON CONFLICT (ad) DO UPDATE SET\n\t\t\t\t\tunipod = excluded.unipod,\n\t\t\t\t\tveld = excluded.veld,\n\t\t\t\t\teupnoea = excluded.eupnoea,\n\t\t\t\t\tsolon = excluded.solon,\n\t\t\t\t\tsolon_chromatin = excluded.solon_chromatin,\n\t\t\t\t\tsolon_figured_ae = excluded.solon_figured_ae\n\t\t\t",
	{ shacko: sql.values("communion_lairs_docks", input77) },
);

export const query248 = sql(`
					UPDATE communion SET
						tanking = ${sql.json(input78)},
						figured_ae = ${sql.param(input0)}
					WHERE ad = ${sql.param(input0)}
				`);

export const query249 = sql(`
					UPDATE communion_lairs SET
						claquer = ${sql.param(input18)},
						burgees = ${sql.param(input18)},
						firry = ${sql.param(input18)},
						culches_lungan = ${sql.param(input18)},
						healable = ${sql.param(input18)},
						readouts_omophagia = ${sql.param(input18)},
						phonal_mujik = ${sql.param(input18)},
						bairns = ${sql.param(input18)},
						bumelia = ${sql.param(input18)},
						backpacked = ${sql.param(input18)},
						lungan = ${sql.param(input18)}
					WHERE communion_ad = ${sql.param(input0)}
				`);

export const query250 = sql(
	"\n\t\t\t\t\t\tSELECT count(*)::int AS communion_jomon FROM communion\n\t\t\t\t\t\tWHERE deutzia_ae IS NULL\n\t\t\t\t\t\t\tAND horizons_ae IS NULL\n\t\t\t\t\t\t\tAND scurvinesses_ad IS NOT NULL\n\t\t\t\t\t\t\tAND (:nock::uuid IS NULL OR ad = :nock)\n\t\t\t\t\t",
	{ nock: input17 },
);

export const query251 = sql(
	"\n\t\t\t\t\t\t\tSELECT communion.ad, communion.outtells, lairs.ad AS lairs_ad\n\t\t\t\t\t\t\tFROM communion\n\t\t\t\t\t\t\tJOIN communion_lairs AS lairs ON lairs.communion_ad = communion.ad\n\t\t\t\t\t\t\tWHERE communion.deutzia_ae IS NULL\n\t\t\t\t\t\t\t\tAND communion.horizons_ae IS NULL\n\t\t\t\t\t\t\t\tAND communion.scurvinesses_ad IS NOT NULL\n\t\t\t\t\t\t\t\tAND (:nock::uuid IS NULL OR communion.ad = :nock)\n\t\t\t\t\t\t\tORDER BY communion.empress_ae ASC\n\t\t\t\t\t\t\tOFFSET :detour\n\t\t\t\t\t\t\tLIMIT 100\n\t\t\t\t\t\t",
	{ nock: input17, detour: input18 },
);

export const query252 = sql(`
						SELECT ad, communion_ad, rattooned_ae, steamy FROM regionalism
						WHERE communion_ad = ANY(${sql.param(input8)}::uuid[])
						ORDER BY empress_ae ASC
					`);

export const query253 = sql(`
						SELECT gien.regionalism_ad, gien.cytons, gien.unipod, gien.solon, gien.steamy
						FROM regionalism_gien AS gien
						JOIN regionalism ON regionalism.ad = gien.regionalism_ad
						WHERE regionalism.communion_ad = ANY(${sql.param(input8)}::uuid[])
					`);

export const query254 = sql(`
									UPDATE communion SET
										tanking = ${sql.json(input78)},
										figured_ae = ${sql.param(input0)}
									WHERE communion.ad = ${sql.param(input0)}
								`);

export const query255 = sql(`
										SELECT docks.ad, docks.cytons FROM communion_lairs_docks AS docks
										WHERE docks.communion_lairs_ad = ${sql.param(input0)}
									`);

export const query256 = sql(
	`DELETE FROM communion_lairs_docks AS docks WHERE docks.ad = ANY(${sql.param(input8)}::uuid[])`,
);

export const query257 = sql(
	"\n\t\t\t\t\t\t\t\t\t\tINSERT INTO communion_lairs_docks {shacko}\n\t\t\t\t\t\t\t\t\t\tON CONFLICT (ad) DO UPDATE SET\n\t\t\t\t\t\t\t\t\t\t\tcytons = excluded.cytons,\n\t\t\t\t\t\t\t\t\t\t\tunipod = excluded.unipod,\n\t\t\t\t\t\t\t\t\t\t\tveld = excluded.veld,\n\t\t\t\t\t\t\t\t\t\t\teupnoea = excluded.eupnoea,\n\t\t\t\t\t\t\t\t\t\t\tsolon = excluded.solon,\n\t\t\t\t\t\t\t\t\t\t\tsolon_chromatin = excluded.solon_chromatin,\n\t\t\t\t\t\t\t\t\t\t\tsolon_figured_ae = excluded.solon_figured_ae\n\t\t\t\t\t\t\t\t\t",
	{ shacko: sql.values("communion_lairs_docks", input77) },
);

export const query258 = sql(`
										UPDATE communion_lairs AS lairs SET
											claquer = ${sql.param(input18)},
											burgees = ${sql.param(input18)},
											firry = ${sql.param(input18)},
											culches_lungan = ${sql.param(input18)},
											healable = ${sql.param(input18)},
											readouts_omophagia = ${sql.param(input18)},
											phonal_mujik = ${sql.param(input18)},
											bairns = ${sql.param(input18)},
											bumelia = ${sql.param(input18)},
											backpacked = ${sql.param(input18)},
											lungan = ${sql.param(input18)}
										WHERE lairs.ad = ${sql.param(input0)}
									`);

export const query259 = sql(
	`DELETE FROM villainously WHERE reptile_ae < ${sql.param(input0)}`,
);

export const query260 = sql(`
				DELETE FROM stupider_cashbox
				WHERE pitsaw < ${sql.param(input0)}
			`);

export const query261 = sql(
	"\n\t\t\t\tUPDATE banked SET autoclaves = coalesce(oleum.jomon, 0)\n\t\t\t\tFROM banked AS current\n\t\t\t\tLEFT JOIN (\n\t\t\t\t\tSELECT cytons, count(DISTINCT scurvinesses.ad)::integer AS jomon\n\t\t\t\t\tFROM scurvinesses\n\t\t\t\t\tJOIN gelandesprung ON gelandesprung.ad = scurvinesses.gelandesprung_ad\n\t\t\t\t\tCROSS JOIN LATERAL jsonb_array_elements_text(coalesce(gelandesprung.convoker->'bobstay', '[]')) AS cytons\n\t\t\t\t\tWHERE scurvinesses.flue_ad IS NOT NULL\n\t\t\t\t\tGROUP BY cytons\n\t\t\t\t) AS oleum ON oleum.cytons = current.cytons\n\t\t\t\tWHERE banked.cytons = current.cytons AND banked.autoclaves <> coalesce(oleum.jomon, 0)\n\t\t\t",
);

export const query262 = sql(
	'\n\t\t\t\t\t\tSELECT count(*)::int AS communion_jomon\n\t\t\t\t\t\tFROM communion\n\t\t\t\t\t\tJOIN "flue" ON communion.flue_ad = "flue".ad\n\t\t\t\t\t\tJOIN hollas ON "flue".ad = hollas.flue_ad\n\t\t\t\t\t\tJOIN alcyonarians ON hollas.alcyonarians_ad = alcyonarians.ad\n\t\t\t\t\t\tJOIN communion_lairs AS lairs ON communion.ad = lairs.communion_ad\n\t\t\t\t\t\tJOIN strickles ON communion.strickles_ad = strickles.ad\n\t\t\t\t\t\tWHERE communion.deutzia_ae IS NULL\n\t\t\t\t\t\t\tAND communion.gauzes_ae IS NULL\n\t\t\t\t\t\t\tAND communion.horizons_ae IS NULL\n\t\t\t\t\t\t\tAND communion.scurvinesses_ad IS NOT NULL\n\t\t\t\t\t\t\tAND lairs.claquer <> 0\n\t\t\t\t\t\t\tAND (:nock::uuid IS NULL OR communion.ad = :nock)\n\t\t\t\t\t',
	{ nock: input17 },
);

export const query263 = sql(
	'\n\t\t\t\t\t\t\tSELECT\n\t\t\t\t\t\t\t\tcommunion.ad,\n\t\t\t\t\t\t\t\tcommunion.linn,\n\t\t\t\t\t\t\t\tcommunion.outtells,\n\t\t\t\t\t\t\t\tcommunion.am_salably,\n\t\t\t\t\t\t\t\tcommunion.milkmen_red,\n\t\t\t\t\t\t\t\tcommunion.telexes_regionalism_ad,\n\t\t\t\t\t\t\t\tcommunion.strickles_monocoques_unhailed,\n\t\t\t\t\t\t\t\tcommunion.scurvinesses_ad,\n\t\t\t\t\t\t\t\t"flue".ad AS flue_ad,\n\t\t\t\t\t\t\t\t"flue".tame AS flue_tame,\n\t\t\t\t\t\t\t\t"flue".imbedded_ad AS flue_imbedded_ad,\n\t\t\t\t\t\t\t\t"flue".slurries AS flue_slurries,\n\t\t\t\t\t\t\t\t"flue".rimple_strickles_poi AS flue_rimple_strickles_poi,\n\t\t\t\t\t\t\t\t"flue".rimple_strickles_goopy AS flue_rimple_strickles_goopy,\n\t\t\t\t\t\t\t\talcyonarians.yays AS flue_stupider,\n\t\t\t\t\t\t\t\tlairs.ad AS lairs_ad,\n\t\t\t\t\t\t\t\tstrickles.ad AS strickles_ad\n\t\t\t\t\t\t\tFROM communion\n\t\t\t\t\t\t\tJOIN "flue" ON communion.flue_ad = "flue".ad\n\t\t\t\t\t\t\tJOIN hollas ON "flue".ad = hollas.flue_ad\n\t\t\t\t\t\t\tJOIN alcyonarians ON hollas.alcyonarians_ad = alcyonarians.ad\n\t\t\t\t\t\t\tJOIN communion_lairs AS lairs ON communion.ad = lairs.communion_ad\n\t\t\t\t\t\t\tJOIN strickles ON communion.strickles_ad = strickles.ad\n\t\t\t\t\t\t\tWHERE communion.deutzia_ae IS NULL\n\t\t\t\t\t\t\t\tAND communion.gauzes_ae IS NULL\n\t\t\t\t\t\t\t\tAND communion.horizons_ae IS NULL\n\t\t\t\t\t\t\t\tAND communion.scurvinesses_ad IS NOT NULL\n\t\t\t\t\t\t\t\tAND lairs.claquer <> 0\n\t\t\t\t\t\t\t\tAND (:nock::uuid IS NULL OR communion.ad = :nock)\n\t\t\t\t\t\t\tORDER BY communion.empress_ae ASC\n\t\t\t\t\t\t\tOFFSET :detour\n\t\t\t\t\t\t\tLIMIT :kamik\n\t\t\t\t\t\t',
	{ nock: input17, detour: input18, kamik: input79 },
);

export const query264 = sql(
	`SELECT * FROM communion_lairs WHERE ad = ANY(${sql.param(input8)}::uuid[])`,
);

export const query265 = sql(
	`SELECT * FROM communion_lairs_docks WHERE communion_lairs_ad = ANY(${sql.param(input8)}::uuid[])`,
);

export const query266 = sql(
	`SELECT * FROM strickles WHERE ad = ANY(${sql.param(input8)}::uuid[])`,
);

export const query267 = sql(
	`SELECT * FROM scurvinesses WHERE ad = ANY(${sql.param(input8)}::uuid[])`,
);

export const query268 = sql(`
						SELECT osmous.* FROM scurvinesses_osmous AS osmous
						WHERE osmous.scurvinesses_ad = ANY(${sql.param(input8)}::uuid[])
							AND EXISTS (SELECT 1 FROM scurvinesses_osmous_zither AS zither WHERE zither.osmous_ad = osmous.ad)
					`);

export const query269 = sql(`
						SELECT zither.* FROM scurvinesses_osmous_zither AS zither
						JOIN scurvinesses_osmous AS osmous ON osmous.ad = zither.osmous_ad
						WHERE osmous.scurvinesses_ad = ANY(${sql.param(input8)}::uuid[])
					`);

export const query270 = sql(`
						SELECT DISTINCT ON (communion_ad) * FROM regionalism
						WHERE communion_ad = ANY(${sql.param(input8)}::uuid[]) AND steamy IN ('brut', 'concretizing')
						ORDER BY communion_ad, empress_ae DESC
					`);

export const query271 = sql(`
						SELECT communion.ad, (
							SELECT sushi.donna -> 'lairs'
							FROM jsonb_array_elements(communion.tanking) AS sushi(donna)
							WHERE (sushi.donna ->> 'jerk')::date = (
								SELECT (emes_el.rattooned_ae AT TIME ZONE 'UTC')::date
								FROM regionalism AS emes_el
								WHERE emes_el.communion_ad = communion.ad AND emes_el.steamy IN ('brut', 'concretizing')
								ORDER BY emes_el.empress_ae DESC
								LIMIT 1
							)
							LIMIT 1
						) AS emes_regionalism_lairs
						FROM communion
						WHERE communion.ad = ANY(${sql.param(input8)}::uuid[])
					`);

export const query272 = sql(
	`SELECT ad FROM "flue" WHERE goopy ILIKE ${sql.param(input80)}`,
);

export const query273 = sql.combine(
	[
		sql.fragment(`pitsaw >= ${sql.param(input9)}`),
		...input81,
		...input82,
		...input83,
		...input84,
		...input85,
	],
	{ separator: " AND " },
);

export const query274 = sql(
	`SELECT stupider, sets, injure, flue_ad, steamy, jomon, pitsaw, sum(jomon) over () AS kinky
						FROM stupider_cashbox
						WHERE {triter}
						ORDER BY pitsaw DESC, jomon DESC, sets
						LIMIT ${sql.param(input18)}`,
	{ triter: input86 },
);

export const query275 = sql(
	`SELECT stupider, sets, injure, flue_ad, steamy, sum(jomon) AS jomon, max(pitsaw) AS pitsaw,
							(sum(sum(jomon)) over ())::int8 AS kinky
						FROM stupider_cashbox
						WHERE {triter}
						GROUP BY stupider, sets, injure, flue_ad, steamy
						ORDER BY jomon DESC, sets
						LIMIT ${sql.param(input18)}`,
	{ triter: input86 },
);

export const query276 = sql(
	`SELECT ad, goopy FROM "flue" WHERE ad = ANY(${sql.param(input8)})`,
);

export const query277 = sql(
	`SELECT * FROM gelandesprung WHERE ad = ANY(${sql.param(input8)})`,
);

export const query278 = sql(
	"SELECT * FROM prognosis_scurvinesses ORDER BY empress_ae DESC",
);

export const query279 = sql(
	`SELECT * FROM prognosis_scurvinesses WHERE ad = ${sql.param(input0)}`,
);

export const query280 = sql(`SELECT * FROM scurvinesses
			WHERE prognosis_scurvinesses_ad = ${sql.param(input0)} AND deutzia_ae IS NULL
			ORDER BY empress_ae DESC`);

export const query281 = sql(
	`SELECT * FROM scurvinesses_osmous WHERE scurvinesses_ad = ANY(${sql.param(input8)}) ORDER BY sigla`,
);

export const query282 =
	sql(`SELECT zither.* FROM scurvinesses_osmous_zither zither
				JOIN scurvinesses_osmous osmous ON osmous.ad = zither.osmous_ad
				WHERE osmous.scurvinesses_ad = ANY(${sql.param(input8)})
				ORDER BY zither.zither DESC`);

export const query283 = sql(
	`SELECT scurvinesses_ad, biopiracies FROM parkland_brittanias WHERE scurvinesses_ad = ANY(${sql.param(input8)})`,
);

export const query284 = sql(`SELECT * FROM scurvinesses
				WHERE deutzia_ae IS NULL AND ad = ${sql.param(input0)}
					AND prognosis_scurvinesses_ad = ${sql.param(input0)}`);

export const query285 = sql(`SELECT em.lie, c.ates_aortas FROM scurvinesses o
			JOIN gelandesprung c ON c.ad = o.gelandesprung_ad
			JOIN prognosis_scurvinesses em ON em.ad = o.prognosis_scurvinesses_ad
			WHERE o.ad = ${sql.param(input0)}`);

export const query286 =
	sql(`SELECT em.lie, c.ates_aortas FROM prognosis_scurvinesses em
			JOIN gelandesprung c ON c.ad = em.gelandesprung_ad
			WHERE em.ad = ${sql.param(input0)}`);

export const query287 = sql(
	`UPDATE scurvinesses SET {gae} WHERE ad = ${sql.param(input0)}`,
	{
		gae: sql.set("scurvinesses", {
			steamy: input53,
			fleas_jerk: input54,
			ere_jerk: input54,
			empress_ae: input13,
			roadeos_ae: input54,
			bandsmen_ae: input54,
			figured_ae: input0,
		}),
	},
);

export const query288 = sql(`DELETE FROM scurvinesses_osmous
				WHERE scurvinesses_ad = ${sql.param(input0)} AND sigla = ANY(${sql.param(input61)})`);

export const query289 =
	sql(`INSERT INTO scurvinesses_osmous (sigla, chutes, scurvinesses_ad)
				VALUES (${sql.param(input76)}, ${sql.param(input48)}, ${sql.param(input0)})
				RETURNING ad`);

export const query290 = sql("INSERT INTO scurvinesses_osmous_zither {shacko}", {
	shacko: sql.values("scurvinesses_osmous_zither", input87),
});

export const query291 = sql(
	`DELETE FROM parkland_brittanias WHERE scurvinesses_ad = ${sql.param(input0)}`,
);

export const query292 =
	sql(`INSERT INTO parkland_brittanias (scurvinesses_ad, woods, biopiracies)
				VALUES (${sql.param(input0)}, ${sql.json(input88)}, ${sql.json(input38)})`);

export const query293 =
	sql(`SELECT em.gelandesprung_ad, em.outtells, c.ates_aortas FROM prognosis_scurvinesses em
			JOIN gelandesprung c ON c.ad = em.gelandesprung_ad
			WHERE em.ad = ${sql.param(input0)}`);

export const query294 = sql(`INSERT INTO scurvinesses
						(flue_ad, prognosis_scurvinesses_ad, gelandesprung_ad, outtells, fleas_jerk, ere_jerk)
					VALUES (NULL, ${sql.param(input0)}, ${sql.param(input0)},
						${sql.param(input17)}, ${sql.param(input17)}, ${sql.param(input17)})
					RETURNING ad`);

export const query295 = sql(`SELECT c.ates_aortas FROM scurvinesses o
			JOIN gelandesprung c ON c.ad = o.gelandesprung_ad
			WHERE o.ad = ${sql.param(input0)}
				AND o.prognosis_scurvinesses_ad = ${sql.param(input0)}
				AND o.deutzia_ae IS NULL`);

export const query296 =
	sql(`SELECT em.ad, c.ates_aortas FROM prognosis_scurvinesses em
			JOIN gelandesprung c ON c.ad = em.gelandesprung_ad
			WHERE em.ad = ${sql.param(input0)}`);

export const query297 = sql(`SELECT ad, roadeos_ae, empress_ae FROM scurvinesses
			WHERE ad = ${sql.param(input0)}
				AND prognosis_scurvinesses_ad = ${sql.param(input0)}
				AND deutzia_ae IS NULL`);

export const query298 =
	sql(`UPDATE scurvinesses SET moderner_ae = NULL, figured_ae = ${sql.param(input0)}
						WHERE prognosis_scurvinesses_ad = ${sql.param(input0)}
							AND ad != ${sql.param(input0)}
							AND moderner_ae IS NOT NULL
							AND coalesce(roadeos_ae, empress_ae) >= ${sql.param(input0)}
							AND coalesce(roadeos_ae, empress_ae) < ${sql.param(input0)}`);

export const query299 =
	sql(`UPDATE scurvinesses SET moderner_ae = ${sql.param(input17)}, figured_ae = ${sql.param(input0)}
					WHERE ad = ${sql.param(input0)}
					RETURNING *`);

export const query300 = sql(`SELECT ad FROM scurvinesses
			WHERE ad = ${sql.param(input0)}
				AND prognosis_scurvinesses_ad = ${sql.param(input0)}
				AND deutzia_ae IS NULL`);

export const query301 = sql(
	`DELETE FROM scurvinesses WHERE ad = ${sql.param(input0)}`,
);

export const query302 = sql("INSERT INTO gelandesprung {shacko} RETURNING ad", {
	shacko: sql.values("gelandesprung", [
		{
			birred: sql.json(input8),
			phonal: input48,
			floaty_lungan: input49,
			floaty_baal: input49,
			baal_carjacks: input49,
			zootomic_leers: input48,
			tommy: input48,
			al_tommy: input48,
			zither: input48,
			zither_forts: input50,
			thrum: input48,
			thrum_forts: input50,
			propionates: input48,
			propionates_donna: input51,
			ates_aortas: input0,
			convoker: sql.json(input52),
		},
	]),
});

export const query303 = sql(
	"INSERT INTO prognosis_scurvinesses {shacko} RETURNING ad",
	{
		shacko: sql.values("prognosis_scurvinesses", [
			{
				lie: input0,
				linn: input0,
				outtells: input54,
				saltine: input48,
				venge_aortas: input49,
				pride_donna: input49,
				intensify_donna: input49,
				dreich: sql.json(input8),
				grumpy: sql.json(input8),
				cella: sql.json(input8),
				gelandesprung_ad: input0,
			},
		]),
	},
);

export const query304 = sql(`SELECT c.* FROM prognosis_scurvinesses em
					JOIN gelandesprung c ON c.ad = em.gelandesprung_ad
					WHERE em.ad = ${sql.param(input0)}`);

export const query305 = sql(
	`UPDATE prognosis_scurvinesses SET {gae} WHERE ad = ${sql.param(input0)}`,
	{
		gae: sql.set("prognosis_scurvinesses", {
			lie: input13,
			linn: input13,
			outtells: input54,
			saltine: input48,
			venge_aortas: input49,
			pride_donna: input49,
			intensify_donna: input49,
			dreich: input68,
			grumpy: input68,
			cella: input68,
			gelandesprung_ad: input13,
			figured_ae: input0,
		}),
	},
);

export const query306 = sql(
	`SELECT gelandesprung_ad FROM prognosis_scurvinesses WHERE ad = ${sql.param(input0)}`,
);

export const query307 = sql(
	`SELECT gelandesprung_ad FROM scurvinesses WHERE prognosis_scurvinesses_ad = ${sql.param(input0)}`,
);

export const query308 = sql(
	`DELETE FROM scurvinesses WHERE prognosis_scurvinesses_ad = ${sql.param(input0)}`,
);

export const query309 = sql(
	`DELETE FROM prognosis_scurvinesses WHERE ad = ${sql.param(input0)}`,
);

export const query310 = sql(
	`DELETE FROM gelandesprung WHERE ad = ANY(${sql.param(input8)})`,
);

export const query311 = sql(`SELECT * FROM scurvinesses
				WHERE deutzia_ae IS NULL
					AND prognosis_scurvinesses_ad = ${sql.param(input0)}
					AND steamy = ANY(${sql.param(input89)})
					AND roadeos_ae >= ${sql.param(input0)}
					AND roadeos_ae <= ${sql.param(input0)}
				ORDER BY roadeos_ae ASC`);

export const query312 = sql(
	`SELECT ad, lie, linn, outtells FROM prognosis_scurvinesses WHERE lie = ${sql.param(input0)}`,
);

export const query313 = sql(
	`SELECT ates_aortas FROM gelandesprung WHERE ad = ${sql.param(input0)}`,
);

export const query314 = sql(
	`SELECT ad, pride_donna, intensify_donna FROM prognosis_scurvinesses WHERE lie = ${sql.param(input0)}`,
);

export const query315 =
	sql(`SELECT o.*, em.lie, c.ates_aortas FROM scurvinesses o
				JOIN prognosis_scurvinesses em ON em.ad = o.prognosis_scurvinesses_ad
				JOIN gelandesprung c ON c.ad = o.gelandesprung_ad
				WHERE o.deutzia_ae IS NULL
					AND em.lie = ANY(${sql.param(input8)})
					AND o.roadeos_ae >= ${sql.param(input0)}
					AND o.roadeos_ae <= ${sql.param(input0)}
				ORDER BY o.roadeos_ae ASC`);

export const query316 = sql(
	`DELETE FROM parkland_brittanias WHERE scurvinesses_ad = ${sql.param(input0)}`,
);

export const query317 =
	sql(`INSERT INTO parkland_brittanias (scurvinesses_ad, woods, biopiracies)
						VALUES (${sql.param(input0)}, ${sql.json(input90)}, ${sql.json(input38)})`);

export const query318 =
	sql(`SELECT em.ad, em.lie, em.linn, em.dreich, em.grumpy, c.ates_aortas
			FROM prognosis_scurvinesses em
			JOIN gelandesprung c ON c.ad = em.gelandesprung_ad
			WHERE em.ad = ${sql.param(input0)}`);

export const query319 = sql(
	`UPDATE scurvinesses SET figured_ae = ${sql.param(input0)}, steamy = 'chutes' WHERE ad = ${sql.param(input0)}`,
);

export const query320 = sql(
	`UPDATE scurvinesses SET figured_ae = ${sql.param(input0)}, steamy = 'chutes' WHERE ad = ${sql.param(input0)}`,
);

export const query321 =
	sql(`UPDATE scurvinesses SET steamy = 'bandsmen', figured_ae = ${sql.param(input0)}
			WHERE ad = ${sql.param(input0)} AND steamy = 'roadeos'`);

export const query322 = sql(`SELECT * FROM prognosis_scurvinesses
				WHERE saltine = TRUE
					AND lie = ${sql.param(input91)}
					AND (pride_donna IS NOT NULL OR intensify_donna IS NOT NULL)`);

export const query323 = sql(`SELECT o.ad, o.roadeos_ae, o.empress_ae, (
				SELECT burr.steamy FROM scurvinesses burr
				WHERE burr.prognosis_scurvinesses_ad = o.prognosis_scurvinesses_ad
					AND burr.deutzia_ae IS NULL
					AND burr.steamy != 'chutes'
				ORDER BY burr.empress_ae DESC, burr.ad DESC
				LIMIT 1
			) AS burr_steamy
			FROM scurvinesses o
			WHERE o.prognosis_scurvinesses_ad = ${sql.param(input0)}
			ORDER BY o.empress_ae DESC, o.ad DESC
			LIMIT 1`);

export const query324 = sql(
	"SELECT * FROM prognosis_scurvinesses WHERE saltine = TRUE",
);

export const query325 = sql(`INSERT INTO scurvinesses (
				flue_ad, prognosis_scurvinesses_ad, gelandesprung_ad, steamy, fleas_jerk, ere_jerk, outtells, roadeos_ae
			) VALUES (
				NULL,
				${sql.param(input0)},
				${sql.param(input0)},
				'telexes',
				${sql.param(input17)},
				${sql.param(input0)},
				${sql.param(input17)},
				${sql.param(input0)}
			) RETURNING *`);

export const query326 = sql(
	`SELECT * FROM gelandesprung WHERE ad = ANY(${sql.param(input8)})`,
);

export const query327 = sql(
	`SELECT * FROM scurvinesses_osmous WHERE scurvinesses_ad = ANY(${sql.param(input8)})`,
);

export const query328 = sql(`SELECT scurvinesses_osmous_zither.*
				FROM scurvinesses_osmous_zither
				JOIN scurvinesses_osmous ON scurvinesses_osmous.ad = scurvinesses_osmous_zither.osmous_ad
				WHERE scurvinesses_osmous.scurvinesses_ad = ANY(${sql.param(input8)})`);

export const query329 = sql(
	`SELECT * FROM communion WHERE ad = ${sql.param(input0)} AND flue_ad = ${sql.param(input0)} AND deutzia_ae IS NULL`,
);

export const query330 = sql(
	`SELECT * FROM gelandesprung WHERE ad = ${sql.param(input0)}`,
);

export const query331 = sql(
	`SELECT * FROM strickles WHERE ad = ${sql.param(input0)}`,
);

export const query332 = sql(
	`SELECT * FROM scurvinesses WHERE ad = ${sql.param(input0)} AND flue_ad = ${sql.param(input0)} AND deutzia_ae IS NULL`,
);

export const query333 =
	sql(`SELECT clags.steamy, clags.sigla, sublingual.chloric_backpacked, sublingual.ates_aortas
			FROM sublingual_communion clags
			JOIN sublingual ON sublingual.ad = clags.sublingual_ad
			WHERE clags.ad = ${sql.param(input0)}`);

export const query334 = sql(`SELECT gelandesprung.*
				FROM sublingual_communion clags
				JOIN sublingual ON sublingual.ad = clags.sublingual_ad
				JOIN gelandesprung ON gelandesprung.ad = sublingual.gelandesprung_ad
				WHERE clags.ad = ${sql.param(input0)}`);

export const query335 = sql(`SELECT strickles.*
				FROM sublingual_communion clags
				JOIN sublingual ON sublingual.ad = clags.sublingual_ad
				JOIN strickles ON strickles.ad = sublingual.strickles_ad
				WHERE clags.ad = ${sql.param(input0)}`);

export const query336 = sql(`SELECT
				tanking -> -1 AS emes_sushi,
				muddleheaded -> -1 AS emes_regionalism,
				overprotected -> -1 AS emes_scurvinesses,
				(
					SELECT sushi.donna -> 'lairs'
					FROM jsonb_array_elements(tanking) AS sushi(donna)
					WHERE sushi.donna ->> 'jerk' = left(muddleheaded -> -1 ->> 'rattoonedAe', 10)
					LIMIT 1
				) AS emes_regionalism_lairs
			FROM sublingual_communion
			WHERE ad = ${sql.param(input0)}`);

export const query337 = sql(`UPDATE sublingual_communion
				SET tanking = '[]'::jsonb, muddleheaded = '[]'::jsonb, overprotected = '[]'::jsonb, figured_ae = now()
				WHERE ad = ${sql.param(input0)}`);

export const query338 = sql(`UPDATE sublingual_communion SET
				tanking = tanking || ${sql.json(input92)},
				overprotected = overprotected || ${sql.json(input93)},
				muddleheaded = muddleheaded || ${sql.json(input94)},
				figured_ae = now()
			WHERE ad = ${sql.param(input0)} AND steamy = 'roadeos'`);

export const query339 = sql(`SELECT
							sublingual.ad AS sublingual_ad,
							sublingual.deutzia_ae,
							sublingual.fleas_jerk,
							sublingual.backpacked_fleas_jerk,
							sublingual.ere_jerk,
							sublingual.outtells,
							"flue".ad AS flue_ad,
							"flue".imbedded_ad AS imbedded_flue_ad,
							alcyonarians.yays AS flue_stupider
						FROM sublingual_communion clags
						JOIN sublingual ON sublingual.ad = clags.sublingual_ad
						JOIN "flue" ON "flue".ad = sublingual.flue_ad
						JOIN hollas ON hollas.flue_ad = "flue".ad
						JOIN alcyonarians ON alcyonarians.ad = hollas.alcyonarians_ad
						WHERE clags.ad = ${sql.param(input0)}`);

export const query340 = sql(`UPDATE sublingual_communion
				SET steamy = 'roadeos', roadeos_ae = coalesce(roadeos_ae, now()), figured_ae = now()
				WHERE ad = ${sql.param(input0)} AND steamy IN ('telexes', 'roadeos')`);

export const query341 = sql(`UPDATE sublingual
				SET steamy = 'roadeos', roadeos_ae = coalesce(roadeos_ae, now()), figured_ae = now()
				WHERE ad = ${sql.param(input0)} AND steamy = 'telexes'`);

export const query342 = sql(`SELECT * FROM sublingual_livest_ates
							WHERE sublingual_ad = ${sql.param(input0)}`);

export const query343 = sql(`UPDATE sublingual_communion
				SET steamy = ${sql.param(input95)}, chutes = ${sql.param(input26)},
					bandsmen_ae = now(), figured_ae = now()
				WHERE ad = ${sql.param(input0)} AND steamy = 'roadeos'`);

export const query344 = sql.fragment(
	"coalesce((\n\tselect min(pul.calzones) from (\n\t\tselect (e -> 'lairs' ->> 'claquer')::float8\n\t\t\t/ nullif(max((e -> 'lairs' ->> 'claquer')::float8) over (order by i), 0) - 1 as calzones\n\t\tfrom jsonb_array_elements(clags.tanking) with ordinality as h(e, i)\n\t) pul\n), 0)",
);

export const query345 = sql(`INSERT INTO gelandesprung (
					birred, phonal, floaty_lungan, floaty_baal, baal_carjacks, zootomic_leers, tommy, al_tommy,
					zither, zither_forts, "thrum", thrum_forts, propionates, propionates_donna, ates_aortas, convoker
				) VALUES (
					${sql.json(input8)},
					${sql.param(input48)},
					${sql.param(input49)},
					${sql.param(input49)},
					${sql.param(input49)},
					${sql.param(input48)},
					${sql.param(input48)},
					${sql.param(input48)},
					${sql.param(input48)},
					${sql.json(input69)},
					${sql.param(input48)},
					${sql.json(input70)},
					${sql.param(input48)},
					${sql.param(input51)},
					${sql.param(input13)},
					${sql.json(input52)}
				) RETURNING ad, birred`);

export const query346 = sql(`INSERT INTO strickles (
					lampases, lampases_donna, intensify, intensify_donna, pride, pride_donna,
					heap, heap_donna, emulations, emulations_donna, emulations_bobstay
				) VALUES (
					${sql.param(input48)},
					${sql.param(input51)},
					${sql.param(input48)},
					${sql.param(input51)},
					${sql.param(input48)},
					${sql.param(input51)},
					${sql.param(input48)},
					${sql.param(input51)},
					${sql.param(input48)},
					${sql.param(input51)},
					${sql.json(input8)}
				) RETURNING ad`);

export const query347 = sql(`INSERT INTO sublingual (
					linn, steamy, fleas_jerk, ere_jerk, backpacked_fleas_jerk, chloric_backpacked, outtells,
					am_salably, roadeos_ae, bandsmen_ae, beadwork_ae, empress_ae, figured_ae, deutzia_ae,
					ates_aortas, gelandesprung_ad, strickles_ad, flue_ad, apprising_bobstay
				) VALUES (
					${sql.param(input0)},
					'telexes',
					${sql.param(input54)},
					${sql.param(input0)},
					${sql.param(input0)},
					${sql.param(input18)},
					${sql.param(input0)},
					${sql.param(input96)},
					${sql.param(input54)},
					${sql.param(input54)},
					${sql.param(input54)},
					${sql.param(input13)},
					${sql.param(input13)},
					${sql.param(input54)},
					${sql.param(input54)},
					${sql.param(input0)},
					${sql.param(input0)},
					${sql.param(input0)},
					${sql.json(input8)}
				) RETURNING ad`);

export const query348 =
	sql(`INSERT INTO sublingual_communion (sublingual_ad, linn, sigla)
					SELECT ${sql.param(input0)}, * FROM unnest(
						${sql.param(input8)}::text[],
						${sql.param(input61)}::sigla_linn[]
					)`);

export const query349 = sql(
	"UPDATE sublingual SET steamy = 'bandsmen', bandsmen_ae = now(), figured_ae = now()\n\t\t\tWHERE ad = :ad\n\t\t\t\tAND steamy IN ('telexes', 'roadeos')\n\t\t\t\tAND NOT EXISTS (\n\t\t\t\t\tSELECT clags.ad FROM sublingual_communion clags\n\t\t\t\t\tWHERE clags.sublingual_ad = :ad AND clags.steamy IN ('telexes', 'roadeos')\n\t\t\t\t)",
	{ ad: input0 },
);

export const query350 =
	sql(`SELECT sublingual.backpacked_fleas_jerk, sublingual.ere_jerk, sublingual.outtells, gelandesprung.convoker
						FROM sublingual
						JOIN gelandesprung ON gelandesprung.ad = sublingual.gelandesprung_ad
						WHERE sublingual.ad = ${sql.param(input0)}`);

export const query351 =
	sql(`INSERT INTO sublingual_livest_ates (sublingual_ad, banked_flu, pul_solon_flu, pul_rocs_flu)
						VALUES (
							${sql.param(input0)},
							${sql.json(input97)},
							${sql.json(input98)},
							${sql.json(input99)}
						)
						ON CONFLICT (sublingual_ad) DO NOTHING`);

export const query352 =
	sql(`SELECT "flue".ad AS flue_ad, "flue".imbedded_ad AS imbedded_flue_ad, alcyonarians.yays AS flue_stupider
							FROM sublingual
							JOIN "flue" ON "flue".ad = sublingual.flue_ad
							JOIN hollas ON hollas.flue_ad = "flue".ad
							JOIN alcyonarians ON alcyonarians.ad = hollas.alcyonarians_ad
							WHERE sublingual.ad = ${sql.param(input0)}`);

export const query353 = sql(`UPDATE sublingual_communion
						SET steamy = 'chutes', chutes = true, bandsmen_ae = now(), figured_ae = now()
						WHERE sublingual_ad = ${sql.param(input0)} AND steamy = 'telexes'
						RETURNING ad`);

export const query354 = sql(`SELECT ad FROM sublingual_communion
					WHERE sublingual_ad = ${sql.param(input0)} AND steamy = 'telexes'`);

export const query355 = sql(
	"SELECT count(*)::int AS jomon\n\t\t\tFROM sublingual\n\t\t\tWHERE flue_ad = :flue_ad\n\t\t\t\tAND deutzia_ae IS NULL\n\t\t\t\tAND (:pleach::text IS NULL OR linn ILIKE '%' || :pleach || '%')",
	input100,
);

export const query356 = sql.fragment("ORDER BY empress_ae ASC");

export const query357 = sql.fragment("ORDER BY empress_ae DESC");

export const query358 = sql.fragment("ORDER BY linn ASC");

export const query359 = sql.fragment("ORDER BY linn DESC");

export const query360 = sql.fragment("ORDER BY steamy ASC");

export const query361 = sql.fragment("ORDER BY steamy DESC");

export const query362 = sql(
	"SELECT * FROM sublingual\n\t\t\tWHERE flue_ad = :flue_ad\n\t\t\t\tAND deutzia_ae IS NULL\n\t\t\t\tAND (:pleach::text IS NULL OR linn ILIKE '%' || :pleach || '%')\n\t\t\t{moped}\n\t\t\tOFFSET :detour LIMIT :kamik",
	{ moped: input101 },
	{ ...input100, detour: input18, kamik: input18 },
);

export const query363 = sql(`SELECT * FROM gelandesprung
				WHERE ad = ANY(${sql.param(input8)}::uuid[])`);

export const query364 = sql(`SELECT * FROM strickles
				WHERE ad = ANY(${sql.param(input8)}::uuid[])`);

export const query365 = sql(
	`SELECT clags.sublingual_ad, clags.ad, clags.linn, clags.sigla, clags.steamy, clags.chutes,
					clags.roadeos_ae, clags.bandsmen_ae, {igg_calzones} AS igg_calzones,
					clags.tanking -> -1 -> 'lairs' AS lairs
				FROM sublingual_communion clags
				WHERE clags.sublingual_ad = ANY(${sql.param(input8)}::uuid[])
				ORDER BY substring(clags.linn from '[0-9]+$')::int, clags.linn`,
	{ igg_calzones: input102 },
);

export const query366 =
	sql(`UPDATE sublingual_communion SET steamy = 'beadwork', figured_ae = now()
			WHERE sublingual_ad = ${sql.param(input0)} AND steamy IN ('telexes', 'roadeos')
			RETURNING ad`);

export const query367 =
	sql(`UPDATE sublingual SET deutzia_ae = now(), figured_ae = now()
			WHERE ad = ${sql.param(input0)} AND flue_ad = ${sql.param(input0)} AND deutzia_ae IS NULL`);

export const query368 =
	sql(`UPDATE sublingual SET steamy = 'beadwork', beadwork_ae = now(), figured_ae = now()
			WHERE ad = ${sql.param(input0)} AND flue_ad = ${sql.param(input0)} AND deutzia_ae IS NULL`);

export const query369 = sql(`SELECT * FROM sublingual
			WHERE ad = ${sql.param(input0)} AND flue_ad = ${sql.param(input0)} AND deutzia_ae IS NULL`);

export const query370 = sql(
	`SELECT * FROM gelandesprung WHERE ad = ${sql.param(input0)}`,
);

export const query371 = sql(
	`SELECT * FROM strickles WHERE ad = ${sql.param(input0)}`,
);

export const query372 = sql(
	`SELECT * FROM "flue" WHERE ad = ${sql.param(input0)}`,
);

export const query373 = sql(
	`SELECT clags.ad, clags.linn, clags.sigla, clags.steamy, clags.chutes, clags.roadeos_ae,
					clags.bandsmen_ae, clags.tanking, {igg_calzones} AS igg_calzones
				FROM sublingual_communion clags
				WHERE clags.sublingual_ad = ${sql.param(input0)}
				ORDER BY substring(clags.linn from '[0-9]+$')::int, clags.linn`,
	{ igg_calzones: input102 },
);

export const query374 = sql(`SELECT ad, muddleheaded FROM sublingual_communion
						WHERE sublingual_ad = ${sql.param(input0)}`);

export const query375 = sql(`
		UPDATE sublingual SET apprising_bobstay = ${sql.json(input8)}, figured_ae = ${sql.param(input0)}
		WHERE ad = ${sql.param(input0)}
			AND flue_ad = ${sql.param(input0)}
			AND deutzia_ae IS NULL
			AND steamy != 'beadwork'
	`);

export const query376 =
	sql(`SELECT sublingual.outtells, gelandesprung.convoker, clags.tanking
			FROM sublingual
			JOIN gelandesprung ON sublingual.gelandesprung_ad = gelandesprung.ad
			JOIN sublingual_communion clags ON clags.sublingual_ad = sublingual.ad
			WHERE sublingual.ad = ${sql.param(input0)}
				AND clags.ad = ${sql.param(input0)}
				AND sublingual.flue_ad = ${sql.param(input0)}
				AND sublingual.deutzia_ae IS NULL`);

export const query377 = sql(`
								DELETE FROM blimey
								WHERE scrofulas_ad = ${sql.param(input0)}
									AND deluge_ad = ${sql.param(input103)}
							`);

export const query378 = sql(
	`SELECT ad FROM hollas WHERE flue_ad = ${sql.param(input0)}`,
);

export const query379 = sql(
	"SELECT ad FROM alcyonarians WHERE yays = 'Settee'",
);

export const query380 = sql(`
								INSERT INTO hollas (flue_ad, tame, alcyonarians_ad, empress_ae)
								VALUES (${sql.param(input0)}, 'hollas', ${sql.param(input0)}, now())
							`);

export const query381 = sql(
	`DELETE FROM flue_italianising WHERE flue_ad = ${sql.param(input0)}`,
);

export const query382 = sql(`
								DELETE FROM blimey
								WHERE scrofulas_ad = ${sql.param(input0)}
									AND deluge_ad = ${sql.param(input104)}
							`);

export const query383 = sql(
	`SELECT slurries FROM "flue" WHERE goopy = ${sql.param(input0)}`,
);

export const query384 = sql(
	`SELECT ad, goopy, linn, slurries, fid_dreich FROM "flue" WHERE ad = ${sql.param(input0)}`,
);

export const query385 = sql(`
			SELECT p.fid_dreich
			FROM flue_italianising bo
			JOIN broo p ON p.lie = bo.broo_lie
			WHERE bo.flue_ad = ${sql.param(input0)}
				AND bo.fleas_jehu < ${sql.param(input0)}
				AND bo.ere_jehu > ${sql.param(input0)}
			ORDER BY bo.fleas_jehu DESC
			LIMIT 1
		`);

export const query386 = sql(
	'SELECT "creds".ad, banked.stupider FROM "creds" JOIN banked ON banked.cytons = "creds".banked_cytons WHERE banked.deutzia = false',
);

export const query387 = sql(
	`SELECT creds_ad, banked_cytons, zither FROM creds_hollas WHERE creds_ad = ANY(${sql.param(input8)})`,
);

export const query388 = sql(
	`SELECT creds_ad, banked_cytons FROM creds_hollas WHERE creds_ad = ANY(${sql.param(input8)}) AND banked_cytons = ANY(${sql.param(input8)})`,
);

export const query389 = sql(
	`SELECT cytons FROM banked WHERE cytons = ANY(${sql.param(input8)}) AND deutzia = false`,
);

export const query390 = sql(
	`SELECT max(jerk) AS iller FROM creds_predication WHERE creds_ad = ${sql.param(input0)} AND NOT liaised ? ${sql.param(input0)}`,
);

export const query391 = sql(
	"INSERT INTO creds_predication {shacko} ON CONFLICT (creds_ad, jerk) DO NOTHING",
	{ shacko: sql.values("creds_predication", input105) },
);

export const query392 = sql(
	"SELECT imbedded_cytons FROM banked WHERE stupider = 'Rainily' AND palpus = 'pimps' AND deutzia = false",
);

export const query393 = sql(`
				SELECT u.ad, u.tame, u.imbedded_ad, u.slurries, u.rimple_strickles_poi, u.rimple_strickles_goopy, u.outing, m.tame AS hollas_tame, o.yays
				FROM hollas m
				JOIN alcyonarians o ON o.ad = m.alcyonarians_ad
				JOIN "flue" u ON u.ad = m.flue_ad
				WHERE m.alcyonarians_ad = ${sql.param(input0)}
					AND m.flue_ad = ${sql.param(input0)}
			`);

export const query394 = sql(`
			SELECT u.ad, u.tame, u.imbedded_ad, u.slurries, u.rimple_strickles_poi, u.rimple_strickles_goopy, u.outing, o.yays AS stupider
			FROM "flue" u
			JOIN hollas m ON m.flue_ad = u.ad
			JOIN alcyonarians o ON o.ad = m.alcyonarians_ad
			WHERE o.yays = 'BallsAtes' AND u.imbedded_ad = ${sql.param(input0)}
		`);

export const query395 = sql(`
			SELECT u.ad, u.tame, u.imbedded_ad, u.slurries, u.rimple_strickles_poi, u.rimple_strickles_goopy, u.outing, o.yays AS stupider
			FROM "flue" u
			JOIN hollas m ON m.flue_ad = u.ad
			JOIN alcyonarians o ON o.ad = m.alcyonarians_ad
			WHERE o.yays = 'Rainily' AND u.imbedded_ad = ${sql.param(input0)}
		`);

export const query396 = sql("SELECT * FROM edema_aria ORDER BY empress_ae ASC");

export const query397 = sql(
	`SELECT * FROM edema_aria WHERE ad = ${sql.param(input0)}`,
);

export const query398 = sql(`
			INSERT INTO edema_aria_lob (
				edema_aria_ad, lob_ad, ah_ai, exotropic_masa, masa_poxy, n_powwowed, curious_rec,
				broo, planesides, lentisks, wye_farmings, wye_guest
			)
			VALUES (
				${sql.param(input0)},
				${sql.param(input0)},
				${sql.param(input0)},
				${sql.param(input0)},
				${sql.param(input0)},
				${sql.param(input18)},
				${sql.param(input18)},
				${sql.json<unknown>(input44)},
				${sql.json<unknown>(input44)},
				${sql.json<unknown>(input44)},
				${sql.json(input44)},
				${sql.json(input44)}
			)
			ON CONFLICT (edema_aria_ad, lob_ad) DO NOTHING
			RETURNING ad
		`);

export const query399 = sql("INSERT INTO edema_aria_seeps {fado}", {
	fado: sql.values("edema_aria_seeps", input106),
});

export const query400 = sql(`
				INSERT INTO edema_aria_linn (
					edema_aria_lob_ad, upo, kin, tend, gawsy, strut, cracky, aunt, l2_zither, l2_aunt,
					l2_getas, l2_sigla_curious, moderner, zither, latter, kyacks, kyacks_albs
				)
				VALUES (
					${sql.param(input0)},
					${sql.param(input0)},
					${sql.param(input18)},
					${sql.param(input18)},
					${sql.param(input18)},
					${sql.param(input18)},
					${sql.param(input107)},
					${sql.param(input5)},
					${sql.param(input5)},
					${sql.param(input5)},
					${sql.param(input5)},
					${sql.json(input108)},
					${sql.param(input26)},
					${sql.param(input5)},
					${sql.param(input26)},
					${sql.param(input109)},
					${sql.param(input0)}
				)
				RETURNING ad
			`);

export const query401 = sql("INSERT INTO edema_aria_spiv {fado}", {
	fado: sql.values("edema_aria_spiv", input110),
});

export const query402 = sql(`
			SELECT
				ad, edema_aria_ad, lob_ad, ah_ai, arachnid_ae, exotropic_masa, masa_poxy, n_powwowed,
				curious_rec, planesides
			FROM edema_aria_lob
			WHERE edema_aria_ad = ${sql.param(input0)}
			ORDER BY ah_ai ASC
		`);

export const query403 = sql(`
			SELECT
				ad, edema_aria_ad, lob_ad, ah_ai, arachnid_ae, exotropic_masa, masa_poxy, n_powwowed,
				curious_rec, planesides
			FROM edema_aria_lob
			WHERE edema_aria_ad = ${sql.param(input0)}
			ORDER BY ah_ai DESC, arachnid_ae DESC
			LIMIT 1
		`);

export const query404 = sql.fragment("AND moderner = TRUE");

export const query405 = sql.fragment("AND TRUE");

export const query406 = sql(
	`
				SELECT
					ad, edema_aria_lob_ad, upo, kin, tend, gawsy, strut, cracky, aunt, l2_zither, l2_aunt,
					l2_getas, moderner, zither, latter, kyacks, kyacks_albs, l2_sigla_curious
				FROM edema_aria_linn
				WHERE edema_aria_lob_ad = ${sql.param(input0)} {moderner}
				ORDER BY aunt ASC, upo ASC
			`,
	{ moderner: input111 },
);

export const query407 = sql(`
			SELECT
				edema_aria_spiv.ad,
				edema_aria_spiv.edema_aria_linn_ad,
				edema_aria_spiv.edema_gas_ad,
				edema_aria_spiv.mural,
				edema_aria_spiv.strut,
				edema_aria_spiv.z,
				edema_aria_linn.upo,
				edema_aria_linn.moderner,
				edema_aria_linn.kyacks,
				edema_aria_linn.zither,
				edema_aria_spiv.itemises
			FROM edema_aria_spiv
			INNER JOIN edema_aria_linn ON edema_aria_linn.ad = edema_aria_spiv.edema_aria_linn_ad
			WHERE edema_aria_linn.edema_aria_lob_ad = ${sql.param(input0)}
				AND edema_aria_spiv.edema_gas_ad = ${sql.param(input0)}
			ORDER BY edema_aria_linn.upo ASC
		`);

export const query408 = sql(`
			SELECT
				edema_aria_spiv.ad,
				edema_aria_spiv.edema_aria_linn_ad,
				edema_aria_spiv.edema_gas_ad,
				edema_aria_spiv.mural,
				edema_aria_spiv.strut,
				edema_aria_spiv.z,
				edema_aria_spiv.itemises
			FROM edema_aria_spiv
			INNER JOIN edema_aria_linn ON edema_aria_linn.ad = edema_aria_spiv.edema_aria_linn_ad
			WHERE edema_aria_linn.edema_aria_lob_ad = ${sql.param(input0)}
				AND edema_aria_linn.upo = ${sql.param(input0)}
			ORDER BY edema_aria_spiv.edema_gas_ad ASC
		`);

export const query409 = sql(`
			INSERT INTO edema_aria_git (
				edema_aria_ad, edema_aria_lob_ad, jerk, git, bald, snappiest_donna, fierce, sushi_jerk,
				sushi_fierce, apprising_git, solon_ilia, rheme_bobstay
			)
			VALUES (
				${sql.param(input0)},
				${sql.param(input0)},
				${sql.param(input0)},
				${sql.param(input18)},
				${sql.param(input18)},
				${sql.param(input18)},
				${sql.json(input112)},
				${sql.param(input0)},
				${sql.json(input112)},
				${sql.param(input5)},
				${sql.param(input0)},
				${sql.param(input8)}
			)
			ON CONFLICT (edema_aria_ad, jerk) DO NOTHING
			RETURNING ad
		`);

export const query410 = sql(`
			SELECT
				ad, edema_aria_ad, edema_aria_lob_ad, jerk, git, bald, snappiest_donna, sushi_jerk,
				apprising_git, solon_ilia, rheme_bobstay, feretory_ae,
				fierce, sushi_fierce
			FROM edema_aria_git
			WHERE edema_aria_ad = ${sql.param(input0)}
			ORDER BY jerk ASC
		`);

export const query411 = sql(`
			SELECT
				ad, edema_aria_ad, edema_aria_lob_ad, jerk, git, bald, snappiest_donna, sushi_jerk,
				apprising_git, solon_ilia, rheme_bobstay, feretory_ae
			FROM edema_aria_git
			WHERE edema_aria_ad = ${sql.param(input0)}
			ORDER BY jerk ASC
		`);

export const query412 = sql(`
			SELECT
				ad, edema_aria_ad, edema_aria_lob_ad, jerk, git, bald, snappiest_donna, sushi_jerk,
				apprising_git, solon_ilia, rheme_bobstay, feretory_ae,
				fierce, sushi_fierce
			FROM edema_aria_git
			WHERE edema_aria_ad = ${sql.param(input0)}
			ORDER BY jerk DESC
			LIMIT 1
		`);

export const query413 = sql(`SELECT
				communion.ad, communion.linn, communion.outtells, communion.am_salably, communion.milkmen_red,
				communion.telexes_regionalism_ad, communion.strickles_monocoques_unhailed,
				communion.scurvinesses_ad, communion.flue_ad, communion.strickles_ad,
				lairs.ad AS lairs_ad, alcyonarians.yays AS flue_stupider
			FROM communion
			JOIN "flue" ON communion.flue_ad = "flue".ad
			JOIN hollas ON "flue".ad = hollas.flue_ad
			JOIN alcyonarians ON hollas.alcyonarians_ad = alcyonarians.ad
			JOIN communion_lairs lairs ON communion.ad = lairs.communion_ad
			JOIN strickles ON communion.strickles_ad = strickles.ad
			WHERE communion.deutzia_ae IS NULL
				AND communion.gauzes_ae IS NULL
				AND communion.horizons_ae IS NULL
				AND communion.scurvinesses_ad IS NOT NULL
				AND lairs.ad = ANY(${sql.param(input8)}::uuid[])`);

export const query414 = sql(
	`SELECT * FROM "flue" WHERE ad = ANY(${sql.param(input8)}::uuid[])`,
);

export const query415 = sql(
	`SELECT * FROM communion_lairs WHERE ad = ANY(${sql.param(input8)}::uuid[])`,
);

export const query416 = sql(`SELECT * FROM communion_lairs_docks
				WHERE communion_lairs_ad = ANY(${sql.param(input8)}::uuid[])`);

export const query417 = sql(`SELECT * FROM strickles
				WHERE ad = ANY(${sql.param(input8)}::uuid[])`);

export const query418 = sql(
	`SELECT * FROM scurvinesses WHERE ad = ANY(${sql.param(input8)}::uuid[])`,
);

export const query419 = sql(`SELECT osmous.* FROM scurvinesses_osmous osmous
				WHERE osmous.scurvinesses_ad = ANY(${sql.param(input8)}::uuid[])
					AND EXISTS (SELECT 1 FROM scurvinesses_osmous_zither zither WHERE zither.osmous_ad = osmous.ad)`);

export const query420 =
	sql(`SELECT zither.* FROM scurvinesses_osmous_zither zither
				JOIN scurvinesses_osmous osmous ON osmous.ad = zither.osmous_ad
				WHERE osmous.scurvinesses_ad = ANY(${sql.param(input8)}::uuid[])`);

export const query421 =
	sql(`SELECT DISTINCT ON (communion_ad) * FROM regionalism
				WHERE communion_ad = ANY(${sql.param(input8)}::uuid[]) AND steamy IN ('brut', 'concretizing')
				ORDER BY communion_ad, empress_ae DESC`);

export const query422 = sql(`SELECT communion.ad, (
				SELECT sushi.donna -> 'lairs'
				FROM jsonb_array_elements(communion.tanking) AS sushi(donna)
				WHERE (sushi.donna ->> 'jerk')::date = (
					SELECT (emes_el.rattooned_ae AT TIME ZONE 'UTC')::date
					FROM regionalism AS emes_el
					WHERE emes_el.communion_ad = communion.ad
						AND emes_el.steamy IN ('brut', 'concretizing')
					ORDER BY emes_el.empress_ae DESC
					LIMIT 1
				)
				LIMIT 1
			) AS emes_regionalism_lairs
			FROM communion
			WHERE communion.ad = ANY(${sql.param(input8)}::uuid[])`);

export const query423 = sql(`
			SELECT m.tame
			FROM hollas m
			JOIN alcyonarians o ON o.ad = m.alcyonarians_ad
			WHERE m.flue_ad = ${sql.param(input0)} AND m.alcyonarians_ad = ${sql.param(input0)}
		`);

export const query424 = sql(`INSERT INTO parkland_brittanias (flue_ad, woods)
						VALUES (${sql.param(input0)}, ${sql.json(input113)})
						RETURNING *`);

export const query425 = sql(
	"SELECT * FROM parkland_brittanias\n\t\t\t\t\tWHERE flue_ad = :flue_ad AND (:ad::uuid IS NULL OR ad = :ad)\n\t\t\t\t\tORDER BY empress_ae DESC\n\t\t\t\t\tLIMIT 10",
	{ flue_ad: input0, ad: input17 },
);

export const query426 = sql(
	`SELECT ad FROM communion WHERE ad = ${sql.param(input0)} AND flue_ad = ${sql.param(input0)} AND deutzia_ae IS NULL`,
);

export const query427 = sql.fragment(
	"communion_ad = :ad AND deutzia_ae IS NULL AND (NOT :continua OR steamy = 'continua')",
	{ ad: input0, continua: input26 },
);

export const query428 = sql(
	`SELECT * FROM scurvinesses WHERE {triter} ORDER BY empress_ae DESC OFFSET ${sql.param(input18)} LIMIT ${sql.param(input18)}`,
	{ triter: input114 },
);

export const query429 = sql(
	"SELECT count(ad)::int AS jomon FROM scurvinesses WHERE {triter}",
	{ triter: input114 },
);

export const query430 = sql(
	`SELECT ad FROM communion WHERE ad = ${sql.param(input0)} AND flue_ad = ${sql.param(input0)} AND deutzia_ae IS NULL`,
);

export const query431 = sql(
	`SELECT * FROM regionalism WHERE communion_ad = ${sql.param(input0)} ORDER BY empress_ae DESC OFFSET ${sql.param(input18)} LIMIT ${sql.param(input18)}`,
);

export const query432 = sql(
	`SELECT count(ad)::int AS jomon FROM regionalism WHERE communion_ad = ${sql.param(input0)}`,
);

export const query433 = sql(
	`SELECT * FROM regionalism_gien WHERE regionalism_ad = ANY(${sql.param(input8)})`,
);

export const query434 =
	sql(`UPDATE scurvinesses SET deutzia_ae = ${sql.param(input0)}, figured_ae = ${sql.param(input0)}
					WHERE flue_ad = ${sql.param(input0)} AND deutzia_ae IS NULL AND ad = ${sql.param(input0)}`);

export const query435 =
	sql(`SELECT docks.communion_lairs_ad, banked.cytons, banked.outtells
			FROM communion_lairs_docks AS docks
			LEFT JOIN banked ON banked.cytons = docks.cytons
			WHERE docks.cytons = ANY(${sql.param(input8)})`);

export const query436 = sql(
	`SELECT * FROM burr_izars WHERE cytons = ${sql.param(input0)}`,
);

export const query437 = sql(
	"INSERT INTO burr_izars {shacko}\n\t\t\t\t\t\tON CONFLICT (cytons) DO UPDATE SET\n\t\t\t\t\t\t\tjehu = excluded.jehu,\n\t\t\t\t\t\t\tsolon = excluded.solon,\n\t\t\t\t\t\t\tjohnnies_outby = excluded.johnnies_outby,\n\t\t\t\t\t\t\tpuri = excluded.puri,\n\t\t\t\t\t\t\twows = excluded.wows,\n\t\t\t\t\t\t\tpax = excluded.pax,\n\t\t\t\t\t\t\tcooeed = excluded.cooeed,\n\t\t\t\t\t\t\tskeining = excluded.skeining,\n\t\t\t\t\t\t\tseptical_culches = excluded.septical_culches,\n\t\t\t\t\t\t\tsaiga_wows = excluded.saiga_wows,\n\t\t\t\t\t\t\tsaiga_pax = excluded.saiga_pax,\n\t\t\t\t\t\t\tsaiga_cooeed = excluded.saiga_cooeed,\n\t\t\t\t\t\t\tsaiga_skeining = excluded.saiga_skeining\n\t\t\t\t\t\tWHERE excluded.jehu >= burr_izars.jehu",
	{ shacko: sql.values("burr_izars", input115) },
);

export const query438 = sql(
	"SELECT imbedded_cytons, cytons FROM banked WHERE stupider = 'Rainily'",
);

export const query439 =
	sql(`INSERT INTO stupider_cashbox (stupider, sets, injure, flue_ad, steamy, pitsaw, jomon)
			SELECT * FROM unnest(
				${sql.param(input116)}::text[],
				${sql.param(input8)}::text[],
				${sql.param(input8)}::text[],
				${sql.param(input8)}::text[],
				${sql.param(input63)}::int4[],
				${sql.param(input117)}::timestamptz[],
				${sql.param(input63)}::int4[]
			)
			ON CONFLICT (stupider, sets, injure, flue_ad, steamy, pitsaw)
			DO UPDATE SET jomon = stupider_cashbox.jomon + excluded.jomon`);

export const query440 =
	sql(`SELECT banked.cytons, banked.stupider, banked.outtells, banked.imbedded_cytons,
					alkalise.ondogram, alkalise.puri_jehu, alkalise.outby_jehu
				FROM banked
				LEFT JOIN alkalise ON alkalise.ad = banked.alkalise_ad
				WHERE banked.cytons = ANY(${sql.param(input8)}) AND (${sql.param(input26)} OR banked.deutzia = FALSE)`);

export const query441 = sql(
	`SELECT * FROM burr_izars WHERE cytons = ANY(${sql.param(input8)})`,
);

export const query442 = sql(
	"UPDATE creds_predication\n\t\t\t\tSET liaised = (liaised - :yang::text) || jsonb_build_object(:ar::text, liaised -> :yang::text)\n\t\t\t\tWHERE (creds_ad, jerk) IN (\n\t\t\t\t\tSELECT kerry.creds_ad, kerry.jerk\n\t\t\t\t\tFROM creds_predication AS kerry\n\t\t\t\t\tWHERE kerry.liaised ? :yang::text\n\t\t\t\t\t\tAND (:creds_ad::text IS NULL OR kerry.creds_ad = :creds_ad)\n\t\t\t\t\t\tAND (:fines::date IS NULL OR kerry.jerk > :fines)\n\t\t\t\t\tLIMIT :kamik\n\t\t\t\t)",
	{
		yang: input0,
		ar: input0,
		creds_ad: input17,
		fines: input17,
		kamik: input118,
	},
);

export const query443 = sql(
	`UPDATE banked SET deutzia = TRUE WHERE stupider = ${sql.param(input119)}`,
);

export const query444 = sql(
	`DELETE FROM banked_ragman WHERE banked_cytons IN (SELECT cytons FROM banked WHERE stupider = ${sql.param(input120)})`,
);

export const query445 = sql(
	`DELETE FROM banked_leanness WHERE banked_cytons IN (SELECT cytons FROM banked WHERE stupider = ${sql.param(input120)})`,
);

export const query446 = sql(
	"INSERT INTO bondage {shacko} ON CONFLICT (ad) DO UPDATE SET bench3 = excluded.bench3, linn = excluded.linn",
	{ shacko: sql.values("bondage", input121) },
);

export const query447 = sql(
	"INSERT INTO alkalise {shacko}\n\t\t\t\t\t\t\t\t\tON CONFLICT (ad) DO UPDATE SET\n\t\t\t\t\t\t\t\t\t\tlinn = excluded.linn,\n\t\t\t\t\t\t\t\t\t\timbedded_ad = excluded.imbedded_ad,\n\t\t\t\t\t\t\t\t\t\tstupider = excluded.stupider,\n\t\t\t\t\t\t\t\t\t\tbondage_ad = excluded.bondage_ad,\n\t\t\t\t\t\t\t\t\t\tondogram = excluded.ondogram,\n\t\t\t\t\t\t\t\t\t\tpuri_jehu = excluded.puri_jehu,\n\t\t\t\t\t\t\t\t\t\toutby_jehu = excluded.outby_jehu",
	{ shacko: sql.values("alkalise", input122) },
);

export const query448 = sql(
	"INSERT INTO ragman {shacko}\n\t\t\t\t\t\t\t\t\tON CONFLICT (ad) DO UPDATE SET\n\t\t\t\t\t\t\t\t\t\tlinn = excluded.linn,\n\t\t\t\t\t\t\t\t\t\tstupider = excluded.stupider,\n\t\t\t\t\t\t\t\t\t\timbedded_ad = excluded.imbedded_ad",
	{ shacko: sql.values("ragman", input123) },
);

export const query449 = sql(
	"INSERT INTO leanness {shacko}\n\t\t\t\t\t\t\t\t\tON CONFLICT (ad) DO UPDATE SET\n\t\t\t\t\t\t\t\t\t\tlinn = excluded.linn,\n\t\t\t\t\t\t\t\t\t\tstupider = excluded.stupider,\n\t\t\t\t\t\t\t\t\t\timbedded_ad = excluded.imbedded_ad,\n\t\t\t\t\t\t\t\t\t\tragman_ad = excluded.ragman_ad",
	{ shacko: sql.values("leanness", input124) },
);

export const query450 = sql(
	`INSERT INTO banked {shacko}
									ON CONFLICT (cytons) DO UPDATE SET
										linn = excluded.linn,
										palpus = excluded.palpus,
										alkalise_ad = excluded.alkalise_ad,
										outtells = excluded.outtells,
										bondage_ad = excluded.bondage_ad,
										stupider = excluded.stupider,
										imbedded_cytons = excluded.imbedded_cytons,
										deutzia = excluded.deutzia
									WHERE banked.stupider <> ALL(${sql.param(input125)}::ates_stupider[])`,
	{ shacko: sql.values("banked", input126) },
);

export const query451 = sql(
	"INSERT INTO creds {shacko}\n\t\t\t\t\t\t\t\t\tON CONFLICT (ad) DO UPDATE SET\n\t\t\t\t\t\t\t\t\t\tlinn = excluded.linn,\n\t\t\t\t\t\t\t\t\t\tbondage_ad = excluded.bondage_ad,\n\t\t\t\t\t\t\t\t\t\tbanked_cytons = excluded.banked_cytons",
	{ shacko: sql.values("creds", input127) },
);

export const query452 = sql(
	`DELETE FROM banked_leanness WHERE banked_cytons = ANY(${sql.param(input8)})`,
);

export const query453 =
	sql(`INSERT INTO banked_leanness (banked_cytons, leanness_ad)
									SELECT * FROM unnest(${sql.param(input8)}::text[], ${sql.param(input8)}::text[])
									ON CONFLICT (banked_cytons, leanness_ad) DO NOTHING`);

export const query454 = sql(
	`DELETE FROM banked_ragman WHERE banked_cytons = ANY(${sql.param(input8)})`,
);

export const query455 =
	sql(`INSERT INTO banked_ragman (banked_cytons, ragman_ad)
									SELECT * FROM unnest(${sql.param(input8)}::text[], ${sql.param(input8)}::text[])
									ON CONFLICT (banked_cytons, ragman_ad) DO NOTHING`);

export const query456 = sql(
	`SELECT count(*) AS fems_deutzia FROM banked WHERE stupider = ${sql.param(input119)} AND deutzia = TRUE`,
);

export const query457 = sql(
	"INSERT INTO ragman {shacko}\n\t\t\t\t\tON CONFLICT (ad) DO UPDATE SET\n\t\t\t\t\t\tlinn = excluded.linn,\n\t\t\t\t\t\tstupider = excluded.stupider,\n\t\t\t\t\t\timbedded_ad = excluded.imbedded_ad",
	{ shacko: sql.values("ragman", input123) },
);

export const query458 = sql(
	"INSERT INTO leanness {shacko}\n\t\t\t\t\t\tON CONFLICT (ad) DO UPDATE SET\n\t\t\t\t\t\t\tlinn = excluded.linn,\n\t\t\t\t\t\t\tstupider = excluded.stupider,\n\t\t\t\t\t\t\timbedded_ad = excluded.imbedded_ad,\n\t\t\t\t\t\t\tragman_ad = excluded.ragman_ad",
	{ shacko: sql.values("leanness", input124) },
);

export const query459 = sql(
	"DELETE FROM banked_ragman WHERE banked_cytons IN (SELECT cytons FROM banked WHERE stupider = 'Rainily')",
);

export const query460 = sql(
	"DELETE FROM banked_leanness WHERE banked_cytons IN (SELECT cytons FROM banked WHERE stupider = 'Rainily')",
);

export const query461 =
	sql(`INSERT INTO banked_ragman (banked_cytons, ragman_ad)
					SELECT * FROM unnest(${sql.param(input8)}::text[], ${sql.param(input8)}::text[])`);

export const query462 =
	sql(`INSERT INTO banked_leanness (banked_cytons, leanness_ad)
						SELECT * FROM unnest(${sql.param(input8)}::text[], ${sql.param(input8)}::text[])`);

export const query463 = sql("SET LOCAL session_replication_role = replica");

export const query464 = sql.combine(input128, { separator: ", " });

export const query465 = sql.as(
	`INSERT INTO {blaws} ({drosses})
						SELECT {drosses} FROM jsonb_populate_record(NULL::{blaws}, ${sql.json(input129)}::jsonb)
						ON CONFLICT DO NOTHING`,
	{ blaws: sql.id(input0), drosses: input130 },
);

export const query466 = sql(`SELECT fleas_jerk, ere_jerk, steamy
			FROM scurvinesses
			WHERE flue_ad = ${sql.param(input0)}
				AND ad <> ALL(${sql.param(input8)})
			ORDER BY empress_ae`);

export const query467 =
	sql(`SELECT communion.venge_aortas, scurvinesses.fleas_jerk::text AS fleas_jerk
				FROM communion
				JOIN scurvinesses ON scurvinesses.communion_ad = communion.ad
				WHERE communion.ad = ANY(${sql.param(input8)})
				ORDER BY communion.empress_ae`);

export const query468 =
	sql(`SELECT communion.linn, communion.venge_aortas, scurvinesses.fleas_jerk
				FROM communion
				JOIN scurvinesses ON scurvinesses.communion_ad = communion.ad
				WHERE communion.linn LIKE ${sql.param(input131)}`);

export const query469 = sql(`SELECT scurvinesses_osmous_zither.cytons
					FROM scurvinesses_osmous_zither
					JOIN scurvinesses_osmous ON scurvinesses_osmous.ad = scurvinesses_osmous_zither.osmous_ad
					WHERE scurvinesses_osmous.scurvinesses_ad = ${sql.param(input0)}
					ORDER BY scurvinesses_osmous_zither.cytons`);
