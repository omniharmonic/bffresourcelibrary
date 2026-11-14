"""Builds data/seed/need-terms.json and fills description/icon in categories.json.

DSL per category: lines "NN: phrase, phrase" (English) or "es NN: phrase, ..." (Spanish).
NN is weight * 100.
"""
import json, re, sys, unicodedata
from collections import Counter

REPO = "/home/user/bffresourcelibrary"

D = {}

def cat(slug, icon, desc, body):
    D[slug] = (icon, desc, body)

cat("free-meals", "🍽️", "Hot meals you can get for free, no questions asked.", """
95: free meal, free food, soup kitchen, hot meal, free lunch, free dinner, free breakfast, meal program, community meal
80: hungry, starving, havent eaten, have not eaten, didnt eat, nothing to eat, something to eat, need to eat, no food, grub, sack lunch, bite to eat
70: eat today, food now, dinner tonight, lunch today, food line, food truck
45: food, feed me
es 90: tengo hambre, comida gratis, no he comido, algo de comer, comida caliente, comedor
""")

cat("first-aid", "🩹", "Bandages and basic care for cuts, blisters, scrapes, sore feet, and small injuries.", """
95: first aid, band aid, bandaid, bandages, blister, first aid kit, my feet are bleeding
80: cut myself, got cut, bleeding, scrape, feet hurt, sore feet, wound, gauze, neosporin, burn, sprained, twisted ankle, foot care, trench foot, feet are wet
45: got hurt, injured, bug bite, rash
es 90: primeros auxilios, curita, vendas, me corte, estoy sangrando, ampolla, me duelen los pies
""")

cat("hygiene-and-toiletries", "🧼", "Free soap, toothbrushes, deodorant, razors, wipes, and other personal care items.", """
95: hygiene kit, toiletries, hygiene products, toothbrush, toothpaste, deodorant, soap, shampoo
80: razor, wet wipes, baby wipes, lotion, chapstick, sunscreen, comb, hair brush, nail clipper, q tips, hygiene
45: smell bad, feel dirty, stink, wash up
es 90: articulos de higiene, jabon, cepillo de dientes, pasta de dientes, desodorante, champu, rastrillo
""")

cat("harm-reduction", "💉", "Narcan, clean needles, test strips, and safer-use supplies, with no judgment.", """
95: narcan, naloxone, clean needles, syringes, needle exchange, syringe exchange, fentanyl test strips, fent test strips, harm reduction, safer use supplies, safe use supplies, sharps container, safer smoking, clean rigs
80: rigs, cookers, clean works, tourniquet, alcohol pads, needle drop box, used needles, shooting up, smoking fent, fent, fentanyl, xylazine, tranq, test strips
55: foil, pipes, straws, m30, blues, using drugs, condoms
40: meth, crack
es 90: naloxona, agujas limpias, jeringas, tiras de prueba, fentanilo, pipas limpias
""")

cat("menstrual-care", "🩸", "Free pads, tampons, and other period supplies.", """
95: pads, tampons, period products, menstrual, sanitary pads, menstrual cup, feminine products, on my period, feminine hygiene
80: period, bleeding through, panty liners, cramps, time of the month, aunt flo
es 90: toallas sanitarias, tampones, mi periodo, regla, menstruacion, toallas femeninas
""")

cat("food-pantries", "🥫", "Free groceries and food boxes to take home, cook, or keep for later.", """
95: food pantry, food bank, groceries, food box, pantry, community food share
80: canned food, canned goods, grocery bag, commodities, food to take, food to cook, food for my family, kids are hungry, no groceries, ran out of food, run out of food, cant afford food
40: food, bread
es 90: despensa, banco de comida, comida para llevar, viveres, mandado, comida para mi familia
""")

cat("medical-care", "🩺", "Doctors, nurses, and clinics for when you are sick or hurt, even without insurance.", """
95: doctor, clinic, nurse, medical care, urgent care, health clinic, emergency room, see a doctor
80: sick, fever, infection, cough, flu, covid, chest pain, blood pressure, diabetes, insulin, ran out of meds, prescription, refill, abscess, wound care, stitches, swollen, the er, clinica
50: pain, meds, medication, got hurt, injured
es 90: estoy enfermo, estoy enferma, medico, me duele, fiebre, medicina, necesito un doctor
""")

cat("sud-treatment", "🌱", "Detox, rehab, and treatment programs to help you stop or cut back on drugs or alcohol.", """
95: detox, rehab, treatment program, get clean, get sober, quit drinking, quit using, addiction treatment, substance use treatment, sober living, inpatient treatment
80: dope sick, withdrawals, withdrawal, drinking too much, alcoholic, addicted, addiction, relapse, sobriety, sober, iop, recovery, kicking dope, kicking heroin, kicking fent
50: heroin, meth, drinking, drunk, kicking
40: crack
es 90: desintoxicacion, rehabilitacion, dejar de tomar, dejar las drogas, adiccion, alcoholico, centro de tratamiento
""")

cat("drinking-water", "💧", "Free clean drinking water and places to fill up your water bottle.", """
95: drinking water, fill my bottle, water fountain, refill water, thirsty, dehydrated, drink of water, water station, water refill
80: water bottle, need water, clean water, bottled water, water jug, no water, hydration
55: gatorade, electrolytes, so hot outside, heat exhaustion
es 90: agua potable, tengo sed, agua para tomar, botella de agua, rellenar agua, agua limpia
""")

cat("snap-enrollment", "🛒", "Help signing up for SNAP (food stamps or EBT card) to buy groceries.", """
95: food stamps, foodstamps, snap, ebt, ebt card, snap benefits, apply for snap, quest card
80: lost my ebt, snap renewal, recertify, colorado peak, benefits card, food assistance, wic
40: peak
es 90: estampillas de comida, cupones de comida, tarjeta ebt, beneficios de comida, solicitar snap, ayuda para comida
""")

cat("dental-care", "🦷", "Free or low-cost dentists for tooth pain, cleanings, pulled teeth, and dentures.", """
95: dentist, dental, toothache, tooth pain, tooth hurts, teeth hurt, broken tooth, cavity, dentures, tooth pulled, pull my tooth, abscessed tooth
80: gums bleeding, swollen jaw, lost a tooth, chipped tooth, teeth cleaning, my teeth, false teeth, wisdom tooth
es 90: dentista, dolor de muelas, me duele la muela, me duele el diente, dentadura, muela
""")

cat("vision-and-glasses", "👓", "Eye exams and free or cheap glasses, reading glasses, or contacts.", """
95: glasses, eyeglasses, eye exam, reading glasses, eye doctor, contact lenses, broke my glasses, lost my glasses, prescription glasses, optometrist
80: cant see, blurry vision, cant read, eyes hurt, eye problems, need readers
55: contacts, readers, vision
es 90: lentes, anteojos, gafas, examen de la vista, no puedo ver bien, oculista
""")

cat("sti-testing", "🧪", "Free, private testing and treatment for HIV, hepatitis C, and sexually transmitted infections.", """
95: sti test, std test, hiv test, std testing, sti testing, hep c, hepatitis c, hiv, syphilis, chlamydia, gonorrhea, herpes, std, sti, get tested
80: burns when i pee, discharge, unprotected sex, rapid test, hiv meds, hep c treatment
60: prep, pep, condoms
es 90: prueba de vih, prueba de its, enfermedades venereas, prueba de sida, condones, vih
""")

cat("medical-equipment", "🦽", "Wheelchairs, walkers, canes, crutches, CPAP, oxygen, and other medical gear.", """
95: wheelchair, walker, cane, crutches, cpap, oxygen tank, medical equipment, knee brace, back brace, shower chair, diabetic supplies, glucose meter, glucose strips
80: broken wheelchair, cant walk far, hearing aid, compression socks, blood pressure cuff, mobility scooter, nebulizer, catheter supplies, ostomy, colostomy bags, prosthetic, oxygen
50: cant walk, brace
es 90: silla de ruedas, andadera, baston, muletas, oxigeno, equipo medico
""")

cat("medication-assisted-treatment-mat", "💊", "Suboxone, methadone, and other medicine that eases withdrawal and helps you stay off opioids.", """
95: suboxone, subs, methadone, bupe, buprenorphine, sublocade, vivitrol, naltrexone, mat program, methadone clinic, subutex, sub strips, dope sick
80: withdrawals, kicking fent, kicking dope, getting off fent, quit fent, quit heroin, off opioids, opioids, opiates
50: kicking, pills, oxy, percs, m30, heroin, fent
es 90: metadona, suboxona, tratamiento para opioides, dejar la heroina, dejar el fentanilo, abstinencia
""")

cat("advocacy", "📣", "Someone on your side who speaks up for you when you are treated unfairly by a system.", """
95: advocate, advocacy, need an advocate, speak up for me, someone on my side
80: treated unfairly, discrimination, discriminated, they wont listen, nobody listens, file a complaint, my rights, civil rights, denied service, harassed, harassment, human rights, disability rights, ada accommodation
50: unfair, complaint, kicked out of, cops took my stuff, police took my stuff, got swept, all roads
es 90: defensor, mis derechos, discriminacion, me trataron mal, quejarme, abogar por mi
""")

cat("medicaid-enrollment", "🏥", "Help signing up for Medicaid (Health First Colorado) so doctor visits and medicine are free.", """
95: medicaid, health first colorado, apply for medicaid, medicaid card, no insurance, uninsured, medicaid renewal
80: health insurance, lost my insurance, insurance card, medical insurance, medicare, cicp, cant afford doctor, insurance
40: peak, coverage
es 90: seguro medico, no tengo seguro, aplicar para medicaid, tarjeta de medicaid, seguro de salud, aseguranza
""")

cat("outreach-social-events", "🎉", "Friendly outreach gatherings with food, supplies, and caring people, like Days in the Park.", """
95: days in the park, outreach event, bff event, boulder feet forward, outreach day, community gathering
80: cookout, bbq, potluck, gathering, meet up, somewhere to hang out
55: the park, lonely, hang out, meet people, party, bff
es 90: evento comunitario, convivio, reunion en el parque, conocer gente, fiesta
es 50: me siento solo
""")

cat("free-community-activities", "🎨", "Free fun things to do around town, like concerts, movies, art, sports, and events.", """
95: free activities, things to do, free events, free concert, free movie, something to do, nothing to do
80: bored, game night, open mic, library events, movie night, pickup game, free museum
50: music, sports, hiking, yoga, fun, chess, museum
es 90: actividades gratis, que hacer, estoy aburrido, eventos gratis, algo que hacer, deportes
""")

cat("drop-in-spaces", "☕", "Indoor places to rest, warm up, cool down, and get coffee during the day, no appointment needed.", """
95: drop in center, day center, drop in, day shelter, warming center, warm up, get out of the cold, get out of the heat
80: cooling center, somewhere to rest, inside during the day, freezing, too cold, too hot, sit down inside, place to chill, rest during the day, bridge house
50: coffee, somewhere to sit, cold, the lodge
es 90: centro de dia, lugar para descansar, hace mucho frio, calentarme, un lugar adentro, cafe caliente
""")

cat("youth-resources", "🧒", "Help for young people, about ages 12 to 24, including runaways, foster youth, and homeless youth.", """
95: youth shelter, runaway, ran away from home, im 17, under 18, homeless youth, aged out of foster care, my parents kicked me out, kicked out by my parents, urban peak, attention homes
80: teen, teenager, foster care, minor, young adult, im 16, im 18, im 19, im 20, im 21
40: high school, school
es 90: soy menor, me escape de casa, jovenes, adolescente, mis papas me corrieron, tengo 17 anos
""")

cat("lgbtqia-resources", "🌈", "Safe, affirming support for gay, lesbian, bi, trans, queer, and nonbinary people.", """
95: lgbtq, lgbt, lgbtqia, gay, lesbian, trans, transgender, nonbinary, non binary, queer, bisexual, out boulder, hrt, gender affirming
80: trans woman, trans man, pronouns, coming out, gender identity, they them, homophobic, transphobic, two spirit, safe for trans, misgendered, hormones
45: drag, name change
es 90: lesbiana, transgenero, no binario, orientacion sexual, identidad de genero, homosexual
""")

cat("tribal-and-indigenous-resources", "🪶", "Services for Native American, American Indian, and Indigenous people and tribal members.", """
95: native american, indigenous, tribal, tribe, american indian, tribal id, cdib, reservation, indian health service, ihs, tribal member, enrolled member, denver indian center
80: native, navajo, lakota, ute, cheyenne, arapaho, sweat lodge, smudge, powwow, two spirit, first nations
es 90: indigena, nativo americano, mi tribu, pueblo indigena, comunidad nativa, soy indigena
""")

cat("veteran-resources", "🎖️", "Help for military veterans, including VA health care, benefits, and veteran housing.", """
95: veteran, va benefits, the va, va hospital, va clinic, dd214, dd 214, vash, ssvf, veteran housing, served in the army, va card
80: military, army, navy, marines, air force, national guard, coast guard, honorable discharge, service connected, gi bill, combat, deployed
50: ptsd, discharged, served, vet
es 90: veterano, ejercito, militar, fuerzas armadas, marina, fuerza aerea
""")

cat("elder-and-senior-resources", "👵", "Help for older adults, about age 60 and up, like senior centers, meals, and aging services.", """
95: senior, seniors, elderly, older adult, senior center, meals on wheels, senior housing, im 65, im 70
80: im 60, im 62, aging, retired, old age, getting old, too old, im older, dementia, memory problems
50: medicare, social security retirement, grandma, grandpa, falls
es 90: persona mayor, tercera edad, adulto mayor, anciano, soy mayor, centro para mayores
""")

cat("community-centers", "🏛️", "Neighborhood centers with programs, classes, showers, computers, and friendly people.", """
95: community center, rec center, recreation center, neighborhood center, east boulder rec, north boulder rec, south boulder rec, ymca, ywca, boys and girls club
80: community space, meeting room, the y
50: gym, pool, place to go
35: library
es 90: centro comunitario, centro de recreacion, el centro, gimnasio
es 40: alberca, la biblioteca
""")

cat("support-and-peer-groups", "🤝", "Groups where people with shared experiences support each other, like AA, NA, or grief groups.", """
95: support group, peer support, peer group, aa meeting, na meeting, alcoholics anonymous, narcotics anonymous, smart recovery, grief group, al anon, 12 step, twelve step, celebrate recovery
80: someone who understands, been there, sponsor, recovery group, sharing circle, people like me, wellness group
50: lonely, isolated, no friends, talk to people, meeting
es 90: grupo de apoyo, alcoholicos anonimos, narcoticos anonimos, apoyo entre pares, alguien que me entienda
es 50: me siento solo
""")

cat("emergency-financial-assistance", "💵", "One-time money help in an emergency, like rent, utility bills, deposits, or fees.", """
95: emergency money, emergency funds, rent assistance, help with rent, cant pay rent, behind on rent, utility bill, electric bill, shut off notice, financial assistance, emergency assistance, first months rent
80: need money, no money, out of money, pay my bill, need cash, cant afford, one time help, fee waiver, application fee, broke, eviction notice
50: cash, deposit, gift card, voucher
30: all roads
es 90: necesito dinero, no tengo dinero, ayuda con la renta, no puedo pagar la renta, ayuda economica, pagar la luz, dinero de emergencia
""")

cat("benefits-enrollment", "📋", "Help applying for government benefits like SSI, SSDI, disability, TANF, and Social Security.", """
95: ssi, ssdi, disability benefits, social security, apply for disability, tanf, colorado works, aand, aged and needy, old age pension, oap, sign up for benefits, apply for benefits
80: benefits, disability check, my check stopped, denied disability, appeal disability, payee, representative payee, social security office, unemployment, cash assistance, leap, peak
50: my check, cut off, disability
es 90: beneficios, discapacidad, seguro social, aplicar para beneficios, mi cheque, ayuda del gobierno, desempleo
""")

cat("employment", "💼", "Help finding a regular job, filling out applications, and getting hired.", """
95: need a job, find a job, looking for work, need work, hiring, employment, job application, apply for jobs, get hired, workforce center, job search, workforce boulder county
80: job, jobs, lost my job, got fired, laid off, unemployed, out of work, full time, part time, paycheck, indeed, ready to work
50: work, resume, temp agency, bridge house
es 90: trabajo, empleo, estoy desempleado, me despidieron, contratando, vacantes
""")

cat("banking-and-financial-services", "🏦", "Help opening a bank account, cashing checks, and keeping your money safe.", """
95: bank account, open a bank account, checking account, savings account, cash a check, cash my check, debit card, check cashing
80: bank, direct deposit, prepaid card, money order, overdrawn, chexsystems, credit union, account closed, safe place for money, my money got stolen
50: atm, stimulus check
es 90: cuenta de banco, abrir una cuenta, cambiar un cheque, tarjeta de debito, el banco, giro postal
""")

cat("legal-assistance", "⚖️", "Free lawyers and legal help with tickets, warrants, court dates, evictions, and other legal problems.", """
95: lawyer, attorney, legal aid, public defender, court date, warrant, camping ticket, ticket for camping, got a ticket, citation, legal help, homeless court, municipal court, failure to appear
80: court, eviction, evicted, probation, parole, arrested, got arrested, charges, criminal record, record sealed, expunge, owe fines, fines, judge, restraining order, protection order, custody, trespassed, trespass, fta, tickets
55: jail, just got out of jail, released from jail, cops took my stuff, police took my stuff, got swept, sweep, camp got swept
es 90: abogado, ayuda legal, me dieron una multa, corte, orden de arresto, me arrestaron, desalojo, multa por acampar
""")

cat("long-term-financial-planning", "📈", "Learning to budget, save money, fix your credit, pay down debt, and plan ahead.", """
95: budget, budgeting, financial planning, save money, saving money, credit score, fix my credit, credit repair, financial coaching, money management, financial literacy
80: debt, in debt, collections, bad credit, build credit, payday loan, student loans, file taxes, tax return, plan for the future, spend all my money
50: taxes, retirement
es 90: presupuesto, ahorrar dinero, mi credito, deudas, planear mi dinero, declarar impuestos
""")

cat("trash-bags-and-disposal", "🗑️", "Free trash bags and places to throw away garbage and keep your camp clean.", """
95: trash bags, garbage bags, dumpster, trash can, clean up camp, camp cleanup, throw away trash, contractor bags, hefty bags
80: trash, garbage, litter, trash pickup, garbage pickup, haul away, camp is messy, needle disposal
40: bags, junk, rats, dispose
es 90: basura, limpiar el campamento, contenedor, bolsas negras, tiradero, desechos
""")

cat("clothing-and-gear", "🧥", "Free clothes, shoes, socks, coats, gloves, and backpacks.", """
95: clothes, clothing, socks, shoes, boots, coat, jacket, backpack, underwear, free clothes, winter coat, gloves, beanie, clothing closet
80: wet clothes, clothes are wet, warm clothes, hand warmers, pants, rain gear, poncho, sweater, hoodie, long johns, thermals, bra, my shoes have holes, shoes fell apart, scarf, hat
40: cold, shirts, sunglasses
es 90: ropa, calcetines, zapatos, chamarra, abrigo, mochila, ropa interior, guantes, ropa caliente
""")

cat("tents-and-sleeping-bags", "⛺", "Tents, sleeping bags, blankets, tarps, and gear to sleep outside safer and warmer.", """
95: tent, sleeping bag, tarp, blankets, blanket, bedroll, sleeping pad, tent got taken, lost my tent, tent stolen, they took my tent, tent got jacked, got swept, camp got swept, sweep
80: cops took my stuff, police took my stuff, city took my stuff, stuff got taken, lost everything, camping gear, sleeping outside, cold at night, freezing at night, emergency blanket, mylar, bivy, ground pad
45: camping, rope, bungee cords
es 90: casa de campana, tienda de campana, bolsa de dormir, cobija, cobijas, lona, me quitaron mis cosas, duermo afuera
""")

cat("showers", "🚿", "Places to take a free hot shower.", """
95: shower, take a shower, hot shower, free shower, shower truck, mobile shower, havent showered
80: wash up, clean up, need to bathe, bathe, bath, smell bad, wash my hair, feel gross
50: dirty, stink, lice
40: get clean
es 90: banarme, regadera, ducha, quiero banarme, necesito banarme, agua caliente
""")

cat("bathrooms", "🚻", "Public restrooms and toilets you can use for free.", """
95: bathroom, restroom, toilet, public restroom, porta potty, porta john, need to pee, need to poop, use the bathroom
80: pee, poop, nowhere to use bathroom, wash my hands, handwashing station, outhouse, potty
50: sink, diarrhea, peed myself
es 90: bano, sanitario, necesito ir al bano, bano publico, excusado, donde orinar
""")

cat("laundry", "🧺", "Places to wash and dry your clothes for free or cheap.", """
95: laundry, laundromat, wash clothes, wash my clothes, washing machine, dryer, laundry voucher, laundry day
80: clean clothes, dirty clothes, clothes smell, clothes are dirty, detergent, quarters for laundry, laundry soap
50: bed bugs, dry my sleeping bag
es 90: lavanderia, lavar ropa, lavar mi ropa, ropa sucia, secadora, lavadora
""")

cat("shelters", "🛏️", "A safe bed indoors tonight, including emergency, overnight, and severe weather shelters.", """
95: shelter, homeless shelter, bed tonight, place to sleep, somewhere to sleep, nowhere to sleep, where to sleep tonight, emergency shelter, overnight shelter, severe weather shelter, boulder shelter, the shelter, bed for tonight
80: sleeping outside, sleeping on the street, no place to stay, nowhere to go, first night homeless, just became homeless, too cold to sleep outside, womens shelter, family shelter, domestic violence shelter, safehouse
55: homeless, kicked out, got kicked out, evicted, crash, the lodge, fleeing
es 90: albergue, refugio, donde dormir, no tengo donde dormir, un lugar para dormir, cama para esta noche, duermo en la calle
""")

cat("storage", "🧳", "Safe places to store your belongings, bags, and papers so they don't get lost or taken.", """
95: storage, store my stuff, lockers, locker, keep my stuff safe, storage unit, bag check, somewhere to keep my things
80: stuff keeps getting stolen, my stuff got stolen, cant carry everything, too much stuff, carry my stuff, get my stuff back
55: belongings, property, property taken, sweep, got swept, cops took my stuff, police took my stuff, city took my stuff, stuff got taken, impound
es 90: guardar mis cosas, casillero, almacenamiento, me robaron mis cosas, donde dejar mis cosas, mis pertenencias
""")

cat("free-and-friendly-public-spaces", "🌳", "Free public places where you're welcome to sit, rest, stay warm or cool, and use wifi.", """
95: public space, public library, somewhere to sit, welcoming place, where can i go, boulder public library, main library
80: library, cooling center, kicked out of the library, cant sit anywhere, get out of the rain, out of the sun, shade, quiet place, safe place to be, nowhere to be, sit inside
50: the park, central park, pearl street, bench, loitering, free wifi
35: park
es 90: biblioteca, parque, lugar publico, un lugar donde sentarme, sombra, un lugar tranquilo
""")

cat("safe-parking", "🚐", "Legal, safe places to park and sleep overnight in your car, van, or RV.", """
95: safe parking, sleep in my car, sleeping in my car, live in my car, living in my car, car camping, live in my van, living in my van, where to park, park overnight, place to park overnight, sleeping in car
80: rv, camper, car got towed, towed, parking ticket, cops knocked on my window, move my car, boot on my car
45: van, car, vehicle, parking, parking lot
es 90: dormir en mi carro, vivo en mi carro, estacionamiento seguro, donde estacionar, vivo en mi camioneta
es 50: mi carro
""")

cat("transportation-assistance", "🚌", "Free bus passes, ride vouchers, and tickets to get where you need to go.", """
95: bus pass, bus ticket, free bus pass, rtd pass, bus fare, ride voucher, need a ride, bus token, greyhound ticket, ticket home, get back home, eco pass, uber voucher, lyft voucher
80: rtd, ride to my appointment, ride to court, no ride, too far to walk, bus money, cant get there, via mobility, paratransit, access a ride, skip bus, flatiron flyer
50: how do i get there, transit, the skip, the hop, the jump, the bound
es 90: pase de autobus, boleto de autobus, necesito un raite, transporte gratis, pasaje, como llego
es 50: camion
""")

cat("bicycles", "🚲", "Free or low-cost bikes to help you get around.", """
80: bike
95: bicycle, need a bike, free bike, bike got stolen, my bike was stolen, someone stole my bike, ebike, e bike, earn a bike
80: mountain bike, cruiser, bike trailer, cargo bike, kids bike, tricycle
40: get around
es 90: bicicleta, necesito una bici, me robaron la bici, ciclas
es 70: bici
""")

cat("bike-repair", "🔧", "Help fixing your bike, like flat tires, brakes, chains, and wheels.", """
95: bike repair, fix my bike, bike broke, bike is broken, community cycles, inner tube, chain broke, bike pump, bike shop, flat tire on my bike
80: flat tire, popped tire, chain fell off, patch kit, bent wheel, wheel bent, spoke, derailleur, bike tools
50: flat, tire, tube, brakes, gears, pump
es 90: arreglar mi bici, llanta ponchada, reparar bicicleta, cadena, frenos, bomba de aire, camara de bici
""")

cat("bike-locks", "🔒", "Free or cheap locks to keep your bike from getting stolen.", """
95: bike lock, u lock, lock for my bike, cable lock, chain lock
80: padlock, bike got stolen, my bike was stolen, someone stole my bike, keep my bike safe, cut my lock, bike theft
50: lock, lost my key
es 75: candado
es 90: candado para bici, cadena con candado, asegurar mi bici, me robaron la bici
""")

cat("car-repair", "🚗", "Help fixing your car so you can keep driving, working, or sleeping in it.", """
95: car repair, fix my car, mechanic, car broke down, car wont start, auto repair, check engine light, jump start, flat tire on my car, tow truck
80: broke down, dead battery, oil change, transmission, alternator, overheating, windshield, emissions, smog, car insurance
45: tire, tires, brakes, battery, registration, towed
es 90: arreglar mi carro, mecanico, mi carro no prende, se descompuso mi carro, bateria del carro, taller
es 50: llanta
""")

cat("gas-money-fuel-assistance", "⛽", "Help paying for gas for your car, or fuel for heating or cooking.", """
95: gas money, gas card, gas voucher, need gas, out of gas, ran out of gas, fuel assistance, gas for my car, fill up my tank, propane
80: empty tank, cant afford gas, gas can, heating fuel, energy assistance, butane, camp stove fuel, heating bill
50: fuel, gas station, leap
es 70: gasolina
es 90: dinero para gasolina, no tengo gasolina, tarjeta de gasolina, se me acabo la gasolina, gas para cocinar
""")

cat("housing", "🏡", "Help getting a place to live long-term, like apartments, vouchers, Coordinated Entry, and rapid rehousing.", """
95: housing, apartment, coordinated entry, ce, ce assessment, housing list, housing voucher, section 8, rapid rehousing, permanent supportive housing, psh, affordable housing, place to live, my own place, boulder housing partners, bhp, housing first, building home, path to home
80: get off the street, stable housing, low income housing, subsidized housing, hud, vi spdat, housing navigator, room for rent, rent a room, move in, landlord, lease, waitlist
55: homeless, eviction, evicted, rent, roommate, deposit
40: all roads
es 90: vivienda, apartamento, departamento, un lugar para vivir, casa propia, seccion 8, lista de vivienda, rentar un cuarto
""")

cat("furniture", "🛋️", "Free furniture and household items for when you move into a new place.", """
95: furniture, bed frame, mattress, couch, dresser, household items, move in kit, moving into an apartment, just got housed, got housed, pots and pans, kitchen stuff
80: new apartment, empty apartment, nothing in my apartment, sleeping on the floor, microwave, dishes, towels, starter kit
45: table, chairs, sheets, pillow, lamp, moving
es 90: muebles, colchon, cama, sillas, mesa, cosas para la casa, trastes
""")

cat("outreach-workshops-and-activities", "🖍️", "Hands-on workshops and activities at outreach events, like art, writing, gardening, and skill shares.", """
95: outreach workshop, workshop at the park, art at the park, art workshop, skill share, creative workshop, healing art, drum circle
80: crafts, drawing, painting, journaling, poetry, gardening, sewing, knitting, beading, something creative
45: art, writing, music, creative, activities
es 90: taller, taller de arte, manualidades, dibujar, pintar, actividades
""")

cat("free-classes-and-workshops", "📚", "Free classes to learn new skills, like computers, English, cooking, money, or parenting.", """
95: free class, free classes, computer class, english class, esl, cooking class, learn english, learn computers, parenting class
80: classes, workshop, seminar, library class, online class, lessons, digital literacy, how to use a computer, money class
45: learn, learn something, training, skills
es 90: clases gratis, clases de ingles, aprender ingles, clase de computacion, cursos gratis
es 45: aprender
""")

cat("technology-access", "💻", "Free computers, internet, Wi-Fi, printing, and help with email or online forms.", """
95: computer, internet, wifi, wi fi, free wifi, printer, printing, use a computer, check my email, laptop, copy machine, fax, scanner
80: email, print, library computer, get online, online application, apply online, make an email, forgot my password, password reset, account locked, tablet, chromebook, zoom, video call, hotspot
40: data, log in
es 90: computadora, usar una computadora, imprimir, correo electronico, revisar mi correo, conectarme, internet gratis
""")

cat("device-charging", "🔌", "Places to charge your phone, laptop, wheelchair, or other devices.", """
95: charge my phone, charge phone, phone charger, charger, charging station, phone is dead, phone died, dead phone, need a charge, power bank, battery pack, charging cable, charge my laptop, charge my wheelchair
80: outlet, plug in, low battery, battery died, battery dead, need power, solar charger, usb cable, iphone charger, android charger, phone battery, power strip, charging
40: cord, battery
es 90: cargar mi telefono, cargar mi celular, cargador, mi celular se murio, enchufe, conectar mi telefono, sin bateria
""")

cat("phone-access", "📱", "Free phones, phone service, and places to make a call.", """
95: free phone, obama phone, obamaphone, lifeline phone, government phone, assurance wireless, safelink, need a phone, lost my phone, phone got stolen, no phone, make a call, use a phone
80: broke my phone, phone broke, cracked phone, phone plan, data plan, phone bill, phone shut off, sim card, phone number, voicemail, prepaid phone, burner, cell phone, call my family, tracfone, no service, lifeline, phone call
40: minutes, phone
es 90: telefono gratis, celular gratis, perdi mi telefono, me robaron el celular, no tengo telefono, hacer una llamada, necesito un celular
""")

cat("education-enrollment-assistance", "🎓", "Help going back to school: GED, college, financial aid, and signing up for programs.", """
95: ged, hsed, high school diploma, finish high school, go back to school, college, community college, fafsa, financial aid, enroll in school, front range community college, frcc, cu boulder, pell grant, scholarship
80: degree, university, transcripts, adult education, adult ed, student aid, tuition, naropa, certificate program
45: school, study, enroll, student loan, esl
es 90: terminar la prepa, regresar a la escuela, universidad, ayuda financiera, inscribirme, escuela para adultos, diploma
""")

cat("identification-and-documents", "🪪", "Help replacing your ID, birth certificate, Social Security card, and other important papers.", """
95: id, lost my id, replace my id, state id, drivers license, birth certificate, social security card, ss card, id voucher, need an id, no id, identification, vital documents, lost my wallet, wallet stolen, id stolen, cops took my id
80: documents, dmv, passport, lost my papers, papers, paperwork, id got taken, expired id, renew my license, green card, immigration papers, itin, my documents got stolen, dl
50: lost everything, name change, mailing address, address for mail, po box, mail
es 90: identificacion, perdi mi identificacion, acta de nacimiento, licencia de manejar, tarjeta de seguro social, documentos, perdi mi cartera, mis papeles
""")

cat("transportation", "🚍", "Ways to get to work, school, or appointments, like bus routes, schedules, and rides.", """
95: get to work, ride to work, transportation, commute, how to get to work, bus route, bus schedule, ride to my job, no way to work, which bus
80: the bus, rtd, skip bus, the skip, the hop, the bound, the jump, flatiron flyer, light rail, carpool, shuttle, getting around, no car
45: bus, ride, rides, how do i get to, drivers license
es 90: transporte, como llegar al trabajo, el autobus, ruta del autobus, horario del autobus, aventon
""")

cat("interview-readiness", "👔", "Help getting ready for a job interview, like clothes, practice, a resume, and a haircut.", """
95: job interview, interview clothes, mock interview, practice interview, interview tips, interview outfit, dress for interview, resume help, write a resume
80: interview, resume, haircut, get a haircut, work clothes, business clothes, look professional, references, cover letter, nervous about interview, what to wear
45: nice clothes, shave, barber
es 90: entrevista de trabajo, ropa para entrevista, prepararme para entrevista, corte de pelo, curriculum, hoja de vida
""")

cat("short-term-work-day-labor", "🛠️", "Same-day or short-term paid work, like day labor, temp jobs, and cash gigs.", """
95: day labor, day work, cash job, paid same day, same day pay, temp work, temp job, side job, odd jobs, labor ready, peopleready, labor hall, quick cash, paid daily, daily pay
80: work today, make money today, need cash today, under the table, side hustle, gig, temp agency, sell plasma, donate plasma
45: moving help, yard work, landscaping, construction work, doordash, delivery driver, plasma
es 90: trabajo por dia, trabajo de un dia, jornalero, trabajo hoy, pago en efectivo, chambitas, chamba
""")

cat("volunteer-opportunities", "🙌", "Ways to volunteer and give back, which can also build skills, references, and community service hours.", """
95: volunteer, volunteering, give back, community service, community service hours, court ordered community service
80: help others, help out, do something good, peer navigator, help at the park, help other homeless people, contribute, be useful
45: keep busy, mentor, references
es 90: voluntario, ser voluntario, ayudar a otros, servicio comunitario, horas comunitarias, quiero ayudar
""")

cat("vocational-programs", "🧰", "Job training programs that teach a trade or skill, like cooking, construction, driving, or forklift.", """
95: job training, vocational, trade school, learn a trade, apprenticeship, cdl, forklift, forklift certification, welding, culinary training, food handler card, servsafe, osha, cna, work program, ready to work
80: certification, training program, skills training, learn a skill, electrician, plumber, carpenter, flagger, phlebotomy, barber school, hvac, wioa, earn while you learn
45: training, construction, warehouse, culinary, mechanic school
es 90: capacitacion, aprender un oficio, escuela tecnica, entrenamiento de trabajo, certificacion, oficio
""")

cat("career-development", "🪜", "Long-term help building a career, like coaching, better-paying jobs, promotions, and work goals.", """
95: career, career coach, career counseling, career goals, better job, better paying job, career change, career center, career path, professional development
80: long term job, stable job, good job, promotion, move up, job skills, right job for me, linkedin, networking
45: resume, my future, raise, mentor
es 90: carrera, mejor trabajo, desarrollo profesional, cambiar de carrera, metas de trabajo
es 45: mi futuro
""")

cat("mental-health-crisis", "🆘", "Urgent help right now if you feel unsafe, want to hurt yourself, overdose, or someone is in danger.", """
95: suicidal, suicide, kill myself, want to die, wanna die, end my life, end it all, hurt myself, self harm, overdose, overdosing, od, hear voices, voices in my head, psychosis, better off dead, cant go on, 988, bhcr, not breathing, wont wake up, going to hurt someone
80: panic attack, crisis
es 95: quiero morir, me quiero matar, hacerme dano, no quiero vivir, escucho voces, sobredosis
""")

cat("mental-health-support-by-outreach", "🫂", "Outreach workers who come to you to talk, check in, and connect you to mental health help.", """
95: outreach worker, someone to talk to, talk to someone, need someone to talk to, street outreach, mental health outreach, care team, co responder, check on me, peer navigator
80: nobody to talk to, overwhelmed, stressed, cant cope, struggling, having a hard time, rough day, case worker, case manager, navigator, venting
50: anxious, anxiety, depressed, sad, lonely, grieving, upset, scared, vent
es 90: alguien con quien hablar, necesito hablar, me siento mal, estoy estresado, estoy deprimido, trabajador social
es 50: ansiedad
""")

cat("mental-and-behavioral-health-care", "🧠", "Counseling, therapy, psychiatry, and medication for mental health or substance use conditions.", """
95: mental health, therapist, therapy, counselor, counseling, psychiatrist, psych meds, mental health clinic, mental health center, behavioral health, mental health partners, psych evaluation
80: depression, depressed, anxiety, bipolar, schizophrenia, schizophrenic, ptsd, trauma, adhd, ocd, tbi, brain injury, head injury, mood swings, nightmares, flashbacks, antidepressants, seroquel, lithium, abilify
45: cant sleep, insomnia, diagnosed, my meds
es 90: salud mental, terapeuta, consejero, psiquiatra, depresion, ansiedad, terapia
""")

cat("online-mental-health-resources", "🌐", "Free apps, websites, chats, and text lines for mental health support on your phone.", """
95: online therapy, mental health app, text line, crisis text line, online support, virtual therapy, meditation app, warmline, warm line, teletherapy, video therapy
80: chat with someone, text someone, telehealth, talk online, self help, calm app, headspace, 7 cups, colorado crisis services, text 988
30: app, website, online, on my phone
es 90: terapia en linea, aplicacion de salud mental, chat de apoyo, linea de texto, apoyo en linea, terapia por video
""")

cat("ongoing-mental-health-care", "🌿", "Regular, long-term counseling, therapy, or psychiatric care with the same provider over time.", """
95: ongoing therapy, regular therapist, weekly therapy, long term counseling, ongoing counseling, see a therapist regularly, psychiatric care, med management, medication management, ongoing treatment, act team, assertive community treatment
80: my therapist, my psychiatrist, my counselor, keep seeing someone, follow up appointment, regular appointments, refill my psych meds, case management, intensive outpatient, stay on my meds, iop
40: long term, my meds
es 90: terapia continua, mi terapeuta, citas regulares, tratamiento a largo plazo, mi psiquiatra, seguir con terapia
""")

cat("faith-based-outreach", "⛪", "Churches and faith groups that come out with meals, supplies, prayer, and kindness.", """
95: church outreach, church meal, faith based, ministry, rescue mission, church group, church van, salvation army, catholic charities, st vincent de paul, church that gives food
80: church, mission, the church people, sunday dinner, church food
45: prayer, pray, pastor, priest, bible, jesus, christian
30: god
es 90: iglesia, la iglesia, ministerio, caridad catolica, ejercito de salvacion, comida en la iglesia
""")

cat("spiritual-and-faith-communities", "🕊️", "Places of worship and faith communities to belong to, like churches, temples, mosques, and synagogues.", """
95: place of worship, church service, mass, synagogue, mosque, temple, congregation, faith community, sangha, meditation group, bible study, go to church, find a church
80: church, worship, sunday service, spiritual community, quaker, buddhist, muslim, jewish, catholic, choir
40: christian, belong, community
es 90: iglesia, misa, ir a la iglesia, sinagoga, mezquita, templo, comunidad de fe
""")

cat("spiritual-support", "🙏", "Someone to pray with or talk to about faith, grief, meaning, or hope, like a chaplain.", """
95: spiritual support, chaplain, pray with me, spiritual guidance, talk to a pastor, lost my faith, meaning in life, spiritual
80: prayer, pastor, priest, pray, someone died, my friend died, lost someone, funeral, memorial, forgiveness, confession, blessing, angry at god, faith
40: grief, meditation, why me, soul, hope, god
es 90: oracion, rezar, necesito un sacerdote, hablar con un pastor, apoyo espiritual, mi fe, alguien murio
""")

cat("pets", "🐕", "Food, vet care, supplies, and pet-friendly services for your dog, cat, or other animal.", """
95: dog food, cat food, pet food, dog needs food, veterinarian, my dog, my cat, pet friendly, dog friendly, service animal, emotional support animal, esa letter, dog is sick, my dog is hurt, pet supplies, fleas, flea, kibble, spay, neuter, humane society, can i bring my dog
80: dog, cat, puppy, kitten, pet, pets, leash, collar, harness, dog bowl, crate, kennel, rabies shot, vet
es 90: comida para perro, comida para gato, mi perro, mi gato, veterinario, mascota, mascotas, perro
""")


CAP = 30
PRUNE = {
    "medication-assisted-treatment-mat": ["subutex", "kicking dope"],
    "medical-care": ["flu", "covid", "abscess"],
    "harm-reduction": ["sharps container", "clean rigs", "alcohol pads", "safe use supplies", "straws"],
    "phone-access": ["safelink", "data plan", "cracked phone", "government phone", "phone number", "voicemail"],
    "legal-assistance": ["charges", "parole", "citation", "homeless court", "probation", "expunge", "judge", "evicted", "fines", "restraining order", "protection order", "custody", "tickets"],
    "sud-treatment": ["iop", "sobriety", "kicking heroin"],
    "transportation-assistance": ["bus token", "lyft voucher"],
    "pets": ["kibble", "esa letter"],
    "mental-and-behavioral-health-care": ["schizophrenic", "ocd"],
    "housing": ["path to home", "waitlist"],
}
BOOST = {
    "harm-reduction": {"m30": 0.6},
    "phone-access": {"lifeline": 0.9, "no service": 0.85, "phone call": 0.85},
    "legal-assistance": {"jail": 0.7, "got swept": 0.6},
    "transportation-assistance": {"skip bus": 0.85, "flatiron flyer": 0.85},
    "pets": {"vet": 0.85},
    "short-term-work-day-labor": {"plasma": 0.8},
}
SCRATCH = "/tmp/claude-0/-home-user-bffresourcelibrary/4099b0f5-25b6-5e7e-a2e1-050ac5260e6c/scratchpad"

def stem(w):
    if len(w) <= 3: return w
    if w.endswith("ies") and len(w) > 4: return w[:-3] + "y"
    if w.endswith("ing") and len(w) > 5:
        b = w[:-3]; return b[:-1] if len(b) > 1 and b[-1] == b[-2] else b
    if w.endswith("ed") and len(w) > 4:
        b = w[:-2]; return b[:-1] if len(b) > 1 and b[-1] == b[-2] else b
    if re.search(r"(sh|ch|x|ss)es$", w): return w[:-2]
    if w.endswith("s") and not w.endswith("ss") and not w.endswith("us"): return w[:-1]
    return w

def fold(s):
    s = unicodedata.normalize("NFKD", s.lower())
    return "".join(ch for ch in s if not unicodedata.combining(ch))

LINE = re.compile(r"^(es\s+)?(\d{2}):\s*(.+)$")
PHRASE_OK = re.compile(r"^[a-z0-9]+( [a-z0-9]+){0,4}$")

def main():
    cats_path = f"{REPO}/data/seed/categories.json"
    cats = json.load(open(cats_path, encoding="utf-8"))
    slugs = [c["slug"] for c in cats]
    missing = set(slugs) - set(D)
    extra = set(D) - set(slugs)
    assert not missing and not extra, (missing, extra)

    terms, errors = [], []
    dropped = []
    seen = set(); sseen = set()
    for slug in slugs:
        icon, desc, body = D[slug]
        for raw in body.strip().splitlines():
            m = LINE.match(raw.strip())
            if not m:
                errors.append(f"{slug}: bad line {raw!r}"); continue
            lang = "es" if m.group(1) else "en"
            w = int(m.group(2)) / 100
            for p in m.group(3).split(","):
                p = re.sub(r"\s+", " ", fold(p).strip())
                if not PHRASE_OK.match(p):
                    errors.append(f"{slug}: bad phrase {p!r}"); continue
                key = (p, slug)
                if key in seen:
                    errors.append(f"{slug}: duplicate {p!r}"); continue
                seen.add(key)
                skey = (" ".join(stem(x) for x in p.split()), slug)
                if skey in sseen:
                    dropped.append(("stemdup", slug, p)); continue
                sseen.add(skey)
                terms.append({"phrase": p, "category": slug, "weight": w, "lang": lang})

    for t in terms:
        b = BOOST.get(t["category"], {})
        if t["phrase"] in b: t["weight"] = b.pop(t["phrase"])
    assert not any(BOOST.values()), BOOST
    # drop phrases containing a shorter same-category phrase (contiguous stemmed tokens) of >= weight
    def toks(t): return [stem(x) for x in t["phrase"].split()]
    def contains(big, small):
        return len(small) < len(big) and any(big[i:i+len(small)] == small for i in range(len(big)-len(small)+1))
    pruned = []
    for t in terms:
        bt = toks(t)
        if any(o is not t and o["category"] == t["category"] and o["weight"] >= t["weight"] and contains(bt, toks(o)) for o in terms):
            dropped.append(("contained", t["category"], t["phrase"])); continue
        pruned.append(t)
    terms = pruned
    for slug, ps in PRUNE.items():
        assert slug in slugs, slug
        for ph in ps:
            assert any(t["category"] == slug and t["phrase"] == ph for t in terms), (slug, ph)
        terms = [t for t in terms if not (t["category"] == slug and t["phrase"] in ps)]
    capped = []
    for slug in slugs:
        cap = 30 if slug == "mental-health-crisis" else CAP
        mine = [t for t in terms if t["category"] == slug]
        es = [t for t in mine if t["lang"] == "es"][:8]
        en = [t for t in mine if t["lang"] == "en"]
        keep_en = sorted(en, key=lambda t: -t["weight"])[: cap - len(es)]
        ids = {id(t) for t in keep_en + es}
        dropped += [("cap", slug, t["phrase"]) for t in mine if id(t) not in ids]
        capped += [t for t in mine if id(t) in ids]
    terms = capped
    open(SCRATCH + "/dropped.txt", "w").write("\n".join(" | ".join(d) for d in dropped))
    for c in cats:
        icon, desc, _ = D[c["slug"]]
        c["description"] = desc
        c["icon"] = icon

    if errors:
        print("\n".join(errors)); sys.exit(1)

    with open(cats_path, "w", encoding="utf-8") as f:
        f.write(json.dumps(cats, indent=2, ensure_ascii=False))
    with open(f"{REPO}/data/seed/need-terms.json", "w", encoding="utf-8") as f:
        f.write("[\n" + ",\n".join("  " + json.dumps(t, ensure_ascii=False) for t in terms) + "\n]\n")
    print("wrote", len(terms), "terms")

main()
