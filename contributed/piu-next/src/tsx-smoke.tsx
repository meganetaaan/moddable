import { fragment, node } from "ir";

export function makeTSXSmokeTree() {
	return (
		<screen width={320} height={240}>
			<row>
				{"Hello"}
				{42}
			</row>
			<>
				{null}
				{false}
				<label text="ok" />
			</>
		</screen>
	);
}

void fragment;
void node;
