'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Calendar, Clock, MapPin, Trophy, Utensils, Coffee, Disc, Martini, Users } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import RulesModal from '@/components/RulesModal';

const HORSESHOE_RULES = `GROUND LEVEL COURTS
1. Dimensions - A horseshoe court shall be a level rectangular area 6 ft wide and a minimum of 46 ft long. A north-south setting is recommended for outdoor courts to minimize the effects of the sun.
2. Pitcher's Box - The pitcher's box is the square 6 ft by 6 ft area at each end of the court. It is composed of 2 parts - 1) the pit - The pit is a rectangular area filled with the substance onto which the shoes are pitched. Its maximum length (in the direction in which the shoes are pitched) is 72 inches and its minimum length is 43 inches. Its maximum width is 36 inches and its minimum width is 31 inches.
3. Stakes - The stake is the target at which the shoe is pitched. Each stake shall be centered between the platforms with a minimum of 21 inches from the stake to the front and back of the pit. On regulation courts the stakes are 40 ft. apart. Stakes shall be 1 inch in diameter and may be made of cold-rolled steel, mild iron, soft metal or synthetic material. Each stake shall be no shorter than 14 and no higher than 15 inches above pit level and they shall both have an approximate 3 inch lean toward each other.
4. Backboards - Every pit should have a backboard. It should be at least 3 feet behind the stake, be at least 1 foot high and extend the width of the pit.

GAME PREPARATION
1. Each game will begin with the flip of a coin or mutual consensus. The winner of the flip will have choice of first or second pitch.
2. Only after all games of a round are complete, can a player practice. He/she shall practice on the court where there is an empty court so as not to be a distraction near a game still in progress. After both pits have been prepared, the players have the option to pitch no more than four warm up shoes. The game must start immediately.
3. A player may practice while waiting for their next opponent.

PLAY OF THE GAME AND VALUE OF THE SHOE

Section A. Innings
The game is broken down into innings. Each inning consists of four pitched shoes, two by each player.

Section B. Foul Shoe
A foul shoe is a shoe which was delivered in non-compliance i.e. hitting the backboard. It scores as a shoe out of count and is to be removed from the pit before any more shoes are pitched.

Section C. Delivery of Shoes
The player pitching first shall deliver both shoes (one at a time) and then the other player shall deliver both shoes (one at a time). A player may deliver the shoes from either the left or right in any one inning. A player shall pitch the entire tournament with the same hand or arm, except in the case of a medical emergency. There shall be a foul-line established, for female players. Once established the player cannot cross the foul-line. If the player crosses the foul-line the shoe will be consider foul.

Section D. Value of the Shoe
1. Ringer - A ringer is a shoe which comes to rest encircling the stake. A straightedge touching both points or any part of the heel calks of the shoe must clear the stake in order for a shoe to be declared a ringer. A ringer has a value of three points.
2. Shoe in Count - A shoe which is not a ringer but closest to the stake (within the pit) is a shoe in count. A shoe in count has a value of one point. If a player delivers two shoes that is closet to the stake each shoe will have a value of one point.
3. Leaner - A "leaner", or any other shoe which is leaning upon touching the stake (but not a ringer), is considered a shoe in count and has a value of two points.

Section E. Length of Game
The length of a game shall be point limit.
1. Point Limit - The game shall be played to a predetermined number of points.
Points in preliminary round play of play is 15. The first team to reach (or exceed) that amount is the winner. Points in final round play 21, the first team to reach (or exceed) that amount is the winner. In preliminary and final round play the winning team must win by two points.

SCORING THE GAME

Section A. Scoring
1. Scoring, only one player can score in each inning.
a. Ringers - Ringers cancel each other. A ringer of one player shall cancel a ringer of the other player and those shoes shall not score any points. Any uncancelled (live) ringer scores three points.
b. Shoes in Count - A shoe in count shall score one point under the following conditions:
1. If there are cancelled ringers and no live ringer, the closest shoe in count to the stake shall score one point.
2. If there are no ringers, the closest shoe in count shall score one point. If the other shoe of that same player is the second closest shoe in count, it shall also score one point.
3. If there is one uncancelled ringer and the other shoe of the scoring contestant is the closest shoe in count to the stake, it shall score one point (four points total).
NOTE: Opposing contestant's shoes in count that are touching the stake or are determined to be an equal distance from the stake shall cancel each other and, like cancelled ringers, shall score no points. In that situation, the next closest shoe in count, if there is one, shall score one point.

2. Calling the Score
a. Points shall be awarded in the following situations. The contestant scoring the points shall call the score.
1. No ringer with the closest shoe in count - call "one point".
2. No ringer with the two closest shoes in count - call "two points".
3. One ringer with either no shoe in count or the other contestant having the closes shoe in count - call "one ringer, three points".
4. One ringer with the closest shoe in count - call "one ringer, four points".
5. Two canceled ringers with the closest shoe in count - call "one ringer each, one point".
6. Two cancelled ringers with one uncancelled ringer - call "three ringers, three points".
7. Two uncancelled ringers - call "two ringers, six points".
b. No points shall be awarded in the following situations. The score shall be called by the contestant who pitched second.
1. All four shoes out of count - call "no score".

Section B. Recording the Score
In tournament play, the score sheet shall be the official record of the game. Players are encouraged to pay close attention to the score at all times. If a question or discrepancy occurs regarding the correct score, the player(s) may approach the scorer between innings rectify the situation. If the discrepancy cannot be corrected to the satisfaction of both teams, a tournament judge(s) shall be called to make the final decision.

Section C. Protests
If a player(s) desires to make a protest, the protest shall be made to the tournament judge(s) at the time the problem occurs. The tournament judge shall make the final ruling on all protests.

Tournament Judges
Tournament Judges shall consist of last year tournament winners. They can consult prior year winners if a consensus is needed.`;

const ScheduleSection = () => {
  const [activeDay, setActiveDay] = useState('friday');

  const scheduleData = {
    friday: [
      {
        time: '09:30 AM',
        title: 'Welcoming Committee',
        description: 'Dana & Christina',
        icon: Users,
        color: 'from-blue-500 to-blue-700',
        bgColor: 'bg-blue-50',
        subtitle: undefined,
        price: undefined,
      },
      {
        time: '11:00 AM',
        title: 'Cornhole Tournament',
        description: 'Matt Ferguson and Danette Schutte',
        price: '$10',
        icon: Trophy,
        color: 'from-green-500 to-green-700',
        bgColor: 'bg-green-50',
      },
       {
         time: '5:30 PM',
         title: 'Drinnk Competition',
         description: 'Form a team and come up with a cocktail. Bring a hearty appetizer.',
         icon: Martini,
         color: 'from-orange-500 to-orange-700',
         bgColor: 'bg-orange-50',
       },
      {
        time: '7:00 PM',
        title: 'Friday Night Meeting',
        description: 'Grab your chairs and tune in for the weekends festivities',
        icon: Users,
        color: 'from-purple-500 to-purple-700',
        bgColor: 'bg-purple-50',
      },
      
      {
        time: '9:00 PM',
        title: 'Danger Zone Dogs',
        description: 'DZD Chefs are back. Quality products only.',
        subtitle: 'Cleared hot for another year',
        icon: Utensils,
        color: 'from-red-500 to-red-700',
        bgColor: 'bg-red-50',
      },

      {
        time: '9:00 PM',
        title: 'Silent Disco',
        description: 'Come dressed in your groovies.',
        subtitle: 'Get ready to boogie.',
        icon: Disc,
        color: 'from-red-500 to-red-700',
        bgColor: 'bg-red-50',
      },
      
    ],
    saturday: [
      {
        time: '10:30 AM',
        title: 'Breakfast',
        description: 'Coffee, Donuts, Egg Sandwhiches, Crepe Bar',
        icon: Coffee,
        color: 'from-yellow-500 to-yellow-700',
        bgColor: 'bg-yellow-50',
      },
      {
        time: '11:00 AM',
        title: 'Horseshoe Tournament',
        description: 'Nancy Reineking and Nicholas Ferry',
        price: '$10',
        icon: Trophy,
        color: 'from-yellow-500 to-yellow-700',
        bgColor: 'bg-yellow-50',
        rulesTitle: 'Churchwell Family Reunion Official Rules of Horseshoe Pitching',
        rules: HORSESHOE_RULES,
      },
      {
        time: '12:00 PM',
        title: 'Dart Tournament',
        description: 'Matt Greenberg Proxy Adam Bennett',
        price: '$10',
        icon: Trophy,
        color: 'from-indigo-500 to-indigo-700',
        bgColor: 'bg-indigo-50',
      },
      {
        time: '12:00 PM',
        title: 'Kids Games',
        description: 'Allie, Kearstyn, Laura, Mackenzie, Lisa, Kari',
        icon: Users,
        color: 'from-pink-500 to-pink-700',
        bgColor: 'bg-pink-50',
      },
      {
        time: '07:00 PM',
        title: 'Dinner',
        description: '70s theme potluck. Bring your meat to grill at the community BBQ ',
        icon: Utensils,
        color: 'from-green-500 to-green-700',
        bgColor: 'bg-green-50',
      },
      
      {
        time: '9:00 PM',
        title: 'Charades',
        description: 'Gianna, Angela, Alexa',
        icon: Users,
        color: 'from-purple-500 to-purple-700',
        bgColor: 'bg-purple-50',
      },
    ],
    sunday: [
      {
        time: '10:30 AM',
        title: 'Brunch',
        description: '<a href="https://docs.google.com/spreadsheets/d/12ID446gBZYEo91Zmj_tlLxvkbo3RoQgyQRJA375kBrE/edit?usp=sharing" target="_blank" rel="noopener noreferrer" class="text-blue-600 underline">Brunch Sign-Up</a>',
        icon: Utensils,
        color: 'from-orange-500 to-orange-700',
        bgColor: 'bg-orange-50',
      },
      {
        time: '12:00 PM',
        title: 'Poker Tournament',
        description: 'Jackie Riker',
        price: '$20',
        icon: Trophy,
        color: 'from-red-500 to-red-700',
        bgColor: 'bg-red-50',
      },
      {
        time: '1:00 PM',
        title: 'Checkers Tournament',
        description: 'TBD',
        icon: Trophy,
        color: 'from-blue-500 to-blue-700',
        bgColor: 'bg-blue-50',
      },
      {
        time: '04:00 PM',
        title: 'Egg Toss',
        description: 'Gino Burton & Alexa Vasquez',
        icon: Trophy,
        color: 'from-yellow-500 to-yellow-700',
        bgColor: 'bg-yellow-50',
      },
      {
        time: '07:00 PM',
        title: 'Dinner',
        description: 'Burgers',
        icon: Utensils,
        color: 'from-green-500 to-green-700',
        bgColor: 'bg-green-50',
      },
      {
        time: '08:30 PM',
        title: 'Raffle',
        description: 'Adam, Andrew, Gino, Tony, Jake, Kate, Dylan, & Hayden',
        icon: Trophy,
        color: 'from-purple-500 to-purple-700',
        bgColor: 'bg-purple-50',
      },
    ],
  } as Record<string, Event[]>;

  const days = [
    { id: 'friday', label: 'Friday', date: 'Sep 3' },
    { id: 'saturday', label: 'Saturday', date: 'Sep 4' },
    { id: 'sunday', label: 'Sunday', date: 'Sep 5' },
  ];

  return (
    <section id="schedule" className="py-20 bg-gradient-to-b from-white to-slate-50">
      <div className="container mx-auto px-4">
        <div className="text-center mb-16">
          <h2 className="text-4xl md:text-5xl font-bold text-slate-800 mb-4">
            Weekend Schedule
          </h2>
          <p className="text-lg text-slate-600 max-w-2xl mx-auto">
            2027 Churchwell Family Reunion Activities - A wonderful weekend full of family fun and memorable events
          </p>
        </div>

        <div className="max-w-4xl mx-auto">
          <Tabs value={activeDay} onValueChange={setActiveDay} className="w-full">
            {/* Day Tabs */}
            <TabsList className="grid w-full grid-cols-3 mb-8 bg-slate-100 rounded-xl p-1">
              {days.map((day) => (
                <TabsTrigger
                  key={day.id}
                  value={day.id}
                  className="data-[state=active]:bg-white data-[state=active]:text-slate-800 data-[state=active]:shadow-md rounded-lg py-3 px-6 transition-all duration-300"
                >
                  <div className="text-center">
                    <div className="font-bold">{day.label}</div>
                    <div className="text-xs opacity-70">{day.date}</div>
                  </div>
                </TabsTrigger>
              ))}
            </TabsList>

            {/* Schedule Content */}
            <AnimatePresence mode="wait">
              {days.map((day) => (
                <TabsContent key={day.id} value={day.id} className="mt-0">
                  <motion.div
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    transition={{ duration: 0.3 }}
                    className="space-y-6"
                  >
                    {scheduleData[day.id as keyof typeof scheduleData].map((event, index) => {
                      const IconComponent = event.icon;
                      const isHtmlDescription = typeof event.description === 'string' && (
                        event.description.includes('<a')
                      );
                      return (
                        <div
                          key={index}
                          className={`${event.bgColor} p-6 rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 group border border-white/50`}
                        >
                          <div className="flex items-start space-x-4">
                            {/* Time */}
                            <div className="flex-shrink-0 text-center">
                              <div className={`w-12 h-12 rounded-full bg-gradient-to-r ${event.color} flex items-center justify-center group-hover:scale-110 transition-transform duration-300 shadow-lg`}>
                                <Clock className="w-6 h-6 text-white" />
                              </div>
                              <div className="mt-2 text-sm font-medium text-slate-600">
                                {event.time}
                              </div>
                            </div>

                            {/* Content */}
                            <div className="flex-1">
                              <div className="flex items-start justify-between">
                                <div className="space-y-2">
                                  <div className="flex items-center space-x-3">
                                    <IconComponent className="w-5 h-5 text-slate-700" />
                                    <h3 className="text-xl font-bold text-slate-800">
                                      {event.title}
                                    </h3>
                                    {event.price && (
                                      <span className={`px-3 py-1 bg-gradient-to-r ${event.color} text-white text-sm font-semibold rounded-full shadow-sm`}>
                                        {event.price}
                                      </span>
                                    )}
                                  </div>
                                  {event.subtitle && (
                                    <p className="text-sm font-medium text-slate-700">
                                      {event.subtitle}
                                    </p>
                                  )}
                                  {isHtmlDescription ? (
                                    <p className="text-slate-600 leading-relaxed" dangerouslySetInnerHTML={{ __html: event.description }} />
                                  ) : (
                                    <p className="text-slate-600 leading-relaxed">
                                      {event.description}
                                    </p>
                                  )}
                                  {event.rules && (
                                    <RulesModal title={event.rulesTitle ?? `${event.title} Rules`} rules={event.rules} />
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </motion.div>
                </TabsContent>
              ))}
            </AnimatePresence>
          </Tabs>
        </div>

        
      </div>
    </section>
  );
};

export default ScheduleSection;

type Event = {
  time: string;
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  bgColor: string;
  price?: string;
  subtitle?: string;
  rules?: string;
  rulesTitle?: string;
};